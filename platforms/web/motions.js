// Web motion runtime: one player per motion kind in design/motions/. Players read only the descriptor the design resolves
// (core/layout.js transitionFor → { kind, ms, easing, split, … }); they hold no timing, easing or distance of their own.
// The shell decides WHEN (which event, which elements, when the state commits); this file decides HOW elements move.
// Implemented kinds are listed in platforms/web.json `motions`.

/* lint:off CSS spec keyword curves (not design values) */
const KEYWORDS = { linear: [0, 0, 1, 1], ease: [.25, .1, .25, 1], 'ease-in': [.42, 0, 1, 1], 'ease-out': [0, 0, .58, 1], 'ease-in-out': [.42, 0, .58, 1] };
/* lint:on */

export const SLOW_KEY = 'backdrop-nav-slow-motion';

// travelling copies (shared image, queued image) are overlays: drawn above every layer of the screen they fly over
const OVERLAY = 2147483000;

export function createMotions({ fallbackEasing }) {
  // a missing easing is a design error (design/checks.js): reported, then the shell's fallback so the motion still runs
  const E = () => { console.error('[motions] easing param missing — declare it / give it a value in the design'); return fallbackEasing() || 'linear'; };
  const timers = {}, anims = {};
  const clear = key => { clearTimeout((timers[key] || {}).a); clearTimeout((timers[key] || {}).b); delete timers[key]; };

  // fade-through timing of a descriptor: out / in derived from the motion's declared ms + split
  function timing(d) {
    const ms = d.fadeMs ?? d.ms ?? 0, split = d.split ?? 0, out = Math.round(ms * split);
    return { OUT: out, IN: ms - out, eo: d.easingOut || d.easing || E(), ei: d.easingIn || d.easing || E(), sc: d.scaleIn ?? 1 };
  }
  const msOf = d => !d || d.kind === 'instant' ? 0 : d.ms ?? ((d.outMs || 0) + (d.inMs || 0));
  const easeOf = d => (d && (d.easing || d.easingIn)) || E();

  // CSS easing string → progress function
  function easing(css) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(css || ''), [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : (KEYWORDS[css] || KEYWORDS.linear);
    const B = (t, p1, p2) => 3 * (1 - t) * (1 - t) * t * p1 + 3 * (1 - t) * t * t * p2 + t * t * t;
    return x => { let lo = 0, hi = 1, t = x; for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (B(t, x1, x2) < x) lo = t; else hi = t; } return B(t, y1, y2); };
  }

  // CSS transitions for state-driven elements: which properties each motion kind moves. part 'surface' = the moving box,
  // 'content' = what fades inside it. Duration / easing from the descriptor (containerMorph content: its fadeSplit share).
  const GEOMETRY = ['top', 'left', 'right', 'bottom', 'width', 'height', 'transform', 'border-radius'];
  const PARTS = {
    move: { surface: GEOMETRY, content: ['opacity'] }, containerMorph: { surface: GEOMETRY, content: ['opacity'] },
    fade: { surface: ['opacity'], content: ['opacity'] }, fadeThrough: { surface: ['opacity'], content: ['opacity'] }, expandFromItem: { surface: ['opacity'], content: ['opacity'] },
    circularReveal: { surface: ['clip-path'], content: ['opacity'] }, expandSurface: { surface: ['clip-path', ...GEOMETRY], content: ['opacity'] }
  };
  function css(d, part = 'surface') {
    if (!d || d.kind === 'instant') return 'none';
    const props = (PARTS[d.kind] || PARTS.move)[part], ms = part === 'content' && d.fadeSplit != null ? Math.round(msOf(d) * d.fadeSplit) : msOf(d), e = easeOf(d);
    return props.map(p => p + ' ' + ms + 'ms ' + e).join(', ');
  }
  const cssAll = d => ({ surface: css(d, 'surface'), content: css(d, 'content'), both: css(d, 'surface') + (d && d.kind !== 'instant' ? ', ' + css(d, 'content') : ''), ms: msOf(d), ease: easeOf(d) });
  // per-property transitions from several descriptors: { opacity: d1, transform: d2 }
  const cssFor = map => Object.entries(map).filter(([, d]) => d && d.kind !== 'instant').map(([p, d]) => p + ' ' + msOf(d) + 'ms ' + easeOf(d)).join(', ') || 'none';
  // show-then-hide flash (e.g. scroll thumb): fade in, hold, fade out — timings from the component's visuals
  function flash(key, el, { inMs, holdMs, outMs }) {
    clear(key);
    el.style.transition = 'opacity ' + inMs + 'ms'; el.style.opacity = '1';
    timers[key] = { a: setTimeout(() => { el.style.transition = 'opacity ' + outMs + 'ms'; el.style.opacity = '0'; }, holdMs) };
  }
  // pulse (placeholders): opacity 1 → low → 1, looping; element i starts i · stagger · ms later
  function pulse(els, d) {
    const ms = d && d.kind === 'pulse' ? +d.ms || 0 : 0;
    els.forEach((el, i) => {
      if (el._phMs === ms) return;
      if (el._ph) el._ph.cancel();
      el._phMs = ms; el._ph = ms ? el.animate([{ opacity: 1 }, { opacity: d.low ?? 1 }, { opacity: 1 }], { duration: ms, delay: Math.round(i * ms * (d.stagger || 0)), iterations: Infinity, easing: d.easing || E() }) : null;
    });
  }
  const NONE = { surface: 'none', content: 'none', both: 'none', ms: 0, ease: 'linear' };

  function rectIn(el, base) { const b = base.getBoundingClientRect(), r = el.getBoundingClientRect(), k = base.offsetWidth / (b.width || 1); return { top: (r.top - b.top) * k, left: (r.left - b.left) * k, w: r.width * k, h: r.height * k }; }

  // ── phased fade through (fade · fadeThrough · expandFromItem content · sharedAxis): out → commit → in.
  // fn after the next render has been drawn (two frames), unless the motion was replaced or cancelled meanwhile
  const afterPaint = (key, T, fn) => requestAnimationFrame(() => requestAnimationFrame(() => { if (timers[key] === T) fn(); }));
  // set(style | null) receives the content style per phase: { op, sc, tx, tr } (tx only for sharedAxis x; dx = signed distance).
  function phased(key, d, { mid, set, dx = 0 }) {
    clear(key);
    if (!d || d.kind === 'instant') { mid(); return set(null); }
    const P = timing(d);
    // fade through: each phase's timer starts once its transition is drawn (after the render), so the old is fully out before
    // the new comes in and the new fully in before the style is released
    const T = timers[key] = {};
    set({ op: 0, sc: 1, tx: -dx, tr: 'opacity ' + P.OUT + 'ms ' + P.eo + ', transform ' + P.OUT + 'ms ' + P.eo });
    afterPaint(key, T, () => { T.a = setTimeout(() => {
      mid();
      set({ op: 0, sc: P.sc, tx: dx, tr: 'none' });
      afterPaint(key, T, () => { set({ op: 1, sc: 1, tx: 0, tr: 'opacity ' + P.IN + 'ms ' + P.ei + ', transform ' + P.IN + 'ms ' + P.ei }); afterPaint(key, T, () => { T.b = setTimeout(() => set(null), P.IN); }); });
    }, P.OUT); });
  }
  // cover fade (splash / gate ↔ app): set(cover | null); style(cover, role) gives each role its style
  function cover(key, d, { out, mid, set }) {
    clear(key);
    if (!d || d.kind === 'instant') { mid(); return set(null); }
    const P = { out, ...timing(d) };
    const T = timers[key] = {};
    set({ ...P, phase: 'out' });
    afterPaint(key, T, () => { T.a = setTimeout(() => {
      mid(); set({ ...P, phase: 'pre' });
      afterPaint(key, T, () => { set({ ...P, phase: 'in' }); afterPaint(key, T, () => { T.b = setTimeout(() => set(null), P.IN); }); });
    }, P.OUT); });
  }
  function coverStyle(c, role) {
    const still = { op: 1, sc: 1, tr: 'none' };
    if (!c) return still;
    if (c.out === role) return { op: 0, sc: 1, tr: c.phase === 'out' ? 'opacity ' + c.OUT + 'ms ' + c.eo : 'none' };
    const entering = c.out === 'app' ? role === 'gate' : role === 'app';
    if (entering && c.phase === 'in') return { op: 1, sc: 1, tr: 'opacity ' + c.IN + 'ms ' + c.ei + ', transform ' + c.IN + 'ms ' + c.ei };
    if (entering) return { op: 0, sc: c.sc, tr: 'none' };
    return still;
  }

  // ── shared element (descriptor shared: 'image'): the source image flies into the target image ([data-shared]) — a copy
  // (cutCopy) cut where the header meets it, the cut part of the image; the real images stay hidden until it lands. Same both ways.
  // fn's result with every running animation / transition on el or an ancestor at its end, then everything put back
  function atRest(el, fn) {
    const list = document.getAnimations().filter(x => { const t = x.effect && x.effect.target; return t && t.contains(el) && isFinite(x.effect.getComputedTiming().endTime); });
    const was = list.map(x => x.currentTime);
    list.forEach(x => { x.currentTime = x.effect.getComputedTiming().endTime; });
    try { return fn(); } finally { list.forEach((x, i) => { x.currentTime = was[i]; }); }
  }
  function sharedFlight(d, src, base, findTarget) {
    if (!d || d.kind === 'instant' || d.shared !== 'image' || !src || !base) return;
    const S = boxOf(src, base), cS = topCut(src, base, null), bS = bottomCut(src, base), bg = src.style.background || getComputedStyle(src).background, giveUp = performance.now() + (d.ms || 0) + (d.sharedMs || 0);
    let copy = cutCopy(base, bg, S, S, cS, cS, bS, bS);
    src.style.visibility = 'hidden';
    let target = null;
    const done = () => { if (copy) copy.root.remove(); copy = null; src.style.visibility = ''; if (target) target.style.visibility = ''; };
    const wait = () => {
      const t = findTarget();
      if (!t || t === src) return performance.now() > giveUp ? done() : requestAnimationFrame(wait);
      target = t; t.style.visibility = 'hidden';
      const [T, cT, bT] = atRest(t, () => [boxOf(t, base), topCut(t, base, null), bottomCut(t, base)]);
      copy.root.remove();
      copy = cutCopy(base, bg, S, T, cS, cT, bS, bT);
      copy.run(d).onfinish = done;
    };
    requestAnimationFrame(wait);
  }
  // ── detail page push / pop (expandFromItem), one player for both directions:
  //   0      the source image lifts: a copy sits exactly on its visible part (sharedFlight's start); the old content (back layer
  //          content + front layer content) fades out (OUT, easingOut). The front layer surface stays.
  //   OUT    commit (the shell renders the new page; scroll restored), then, measured at rest:
  //          · the front layer surface moves from its old top to its new one (ms, easing) — the surface, visible all the way
  //          · the new content fades in (IN, easingIn); on push the back layer parts slide in after it (staggerIn)
  //          · the copy flies to the target's visible part (sharedMs, sharedEasing); real images hidden until it lands
  //   Fixed header parts ([data-fixed] in the back layer, keyed by slot + content) are not part of the fade: a part whose key is
  //   in both headers stays (slides if its place changed, ms / easing); only parts that differ cross-fade (ghost out, new in).
  // els: { base, back, front, content, src } · commit(after): render the new page, then call after() · target(): the image to land on
  // · enter(): the new back-layer parts to stagger in (push). Returns the total duration.
  function detailTransition(key, d, els, commit, target, enter) {
    cancel(key);
    const { base, back, front, content, src } = els, P = timing(d), A = anims[key] = [];
    const top0 = front ? rectIn(front, base).top : 0;
    const S = src && src.isConnected ? boxOf(src, base) : null, cS = S ? topCut(src, base, front) : 0;
    const bg = S ? (src.style.background || getComputedStyle(src).background) : '';
    let copy = S ? cutCopy(base, bg, S, S, cS, cS) : null;
    if (copy) src.style.visibility = 'hidden';
    const olds = back ? fixedParts(back, base).map(p => ({ ...p, ghost: ghostOf(p, base) })) : [];
    olds.forEach(p => { p.el.style.visibility = 'hidden'; });
    const out = fadeOut(P, [...(back ? loose(back) : []), content]);
    A.push(...out);
    let landed = null;
    const finish = () => { if (copy) copy.root.remove(); copy = null; if (src) src.style.visibility = ''; if (landed) landed.style.visibility = ''; };
    const dropGhosts = () => olds.forEach(p => p.ghost.remove());
    A.push({ cancel: () => { dropGhosts(); olds.forEach(p => { p.el.style.visibility = ''; }); finish(); } });
    timers[key] = { a: whenOut(P, out, () => commit(() => {
      out.forEach(x => x.cancel());
      olds.forEach(p => { p.el.style.visibility = ''; });
      const t = copy && target && target(), T = t && t !== src ? boxOf(t, base) : null, top1 = front ? rectIn(front, base).top : 0, dy = top1 - top0;
      const cT = T ? topCut(t, base, front) : 0;
      const news = fixedParts(back, base), used = new Set(), mv = { duration: d.ms || 0, easing: d.easing || E() };
      const newIn = [];
      news.forEach(n => {
        const o = d.fixedParts === 'stay' ? olds.find(p => !used.has(p) && p.key === n.key) : null;
        if (!o) return newIn.push(n.el);
        used.add(o); o.ghost.remove();
        const x = o.r.left - n.r.left, y = o.r.top - n.r.top;
        if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) A.push(n.el.animate([{ transform: 'translate(' + x + 'px,' + y + 'px)' }, { transform: 'none' }], mv));
      });
      // header parts that differ fade through: the old ones (ghosts) out first, then the new ones in
      const gone = olds.filter(p => !used.has(p)), gOut = fadeOut(P, gone.map(p => p.ghost)), pIn = fadeIn(P, newIn, gOut.length > 0);
      A.push(...gOut, ...pIn);
      gOut.forEach((g, i) => { g.onfinish = g.oncancel = () => gone[i].ghost.remove(); });
      if (gOut.length) whenOut(P, gOut, () => pIn.forEach(a => a.play()));
      if (front && Math.abs(dy) > 0.5) A.push(front.animate([{ top: top0 + 'px' }, { top: top1 + 'px' }], mv));
      A.push(...fadeIn(P, [...(back ? loose(back) : []), content]));
      if (enter) staggerIn(d, enter());
      if (!copy) return;
      if (!T) return finish();
      landed = t; t.style.visibility = 'hidden';
      copy.root.remove();
      copy = cutCopy(base, bg, S, T, cS, cT);
      const fly = copy.run(d);
      A.push(...copy.anims); fly.onfinish = finish; fly.oncancel = finish;
    })) };
    return P.OUT + Math.max(d.ms || 0, P.IN, d.sharedMs || 0);
  }
  // ── fade through (every player): the old fades out (OUT, easingOut); only once it is out does the new fade in (IN, easingIn,
  // from scaleIn). fadeOut → whenOut(fn): fn runs when every fade-out has finished or been cancelled · fadeIn(…, held): held
  // fade-ins wait at their start (opacity 0) until play()ed.
  const fadeOut = (P, els) => els.filter(Boolean).map(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: P.OUT, easing: P.eo, fill: 'forwards' }));
  const whenOut = (P, outs, fn) => {
    if (!outs.length) return setTimeout(fn, P.OUT);
    Promise.allSettled(outs.map(a => a.finished)).then(fn);   // cancelled mid-way: still commits (the intent must land)
    return null;
  };
  const fadeIn = (P, els, held) => els.filter(Boolean).map(el => { const a = el.animate([{ opacity: 0, transform: 'scale(' + P.sc + ')' }, { opacity: 1, transform: 'none' }], { duration: P.IN, easing: P.ei, fill: 'backwards' }); if (held) a.pause(); return a; });
  // the image's box: rect + corner radius (px)
  const boxOf = (el, base) => {
    const r = rectIn(el, base), cs = getComputedStyle(el).borderTopLeftRadius, n = parseFloat(cs) || 0;
    return { ...r, rad: Math.min(cs.endsWith('%') ? n / 100 * Math.min(r.w, r.h) : n, Math.min(r.w, r.h) / 2) };
  };
  // what covers el from above (the header): horizontal bands in base coordinates { top, bottom, moves }, cut exactly where the
  // header meets the image. moves: part of the front layer (moves with the front surface). Below / at the sides nothing cuts: content
  // renders under the peek / nav bar / rail, so the copy is whole there.
  const bandsOf = (el, base, front) => {
    const e = rectIn(el, base), mid = e.top + e.h / 2, F = front ? rectIn(front, base) : null, out = [];
    for (let p = el.parentElement; p && p !== base; p = p.parentElement) {
      if (getComputedStyle(p).overflowY === 'visible') continue;
      const q = rectIn(p, base), inF = !!(front && (front === p || front.contains(p)));
      if (q.top > e.top + 0.5) out.push({ top: inF ? F.top : 0, bottom: q.top, moves: inF });
    }
    for (const o of base.querySelectorAll('[data-occluder]')) {
      if (o.contains(el) || !(o.checkVisibility ? o.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : o.offsetParent)) continue;
      const q = rectIn(o, base);
      if (q.top + q.h / 2 >= mid || q.top + q.h <= e.top || q.top >= e.top + e.h || q.left >= e.left + e.w || q.left + q.w <= e.left) continue;
      const ob = o.getBoundingClientRect(), eb = el.getBoundingClientRect(), hit = document.elementFromPoint((Math.max(ob.left, eb.left) + Math.min(ob.right, eb.right)) / 2, (Math.max(ob.top, eb.top) + Math.min(ob.bottom, eb.bottom)) / 2);
      if (!hit || !o.contains(hit)) continue;
      out.push({ top: q.top, bottom: q.top + q.h, moves: !!(front && front.contains(o)) });
    }
    return out;
  };
  // how much of el the peek / nav bar ([data-occluder="bottom"]) hide at its bottom (px): from the highest top of those over it
  const bottomCut = (el, base) => {
    const e = rectIn(el, base); let m = Infinity;
    for (const o of base.querySelectorAll('[data-occluder="bottom"]')) {
      if (o.contains(el) || !(o.checkVisibility ? o.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : o.offsetParent)) continue;
      const q = rectIn(o, base);
      if (q.left >= e.left + e.w || q.left + q.w <= e.left || q.top >= e.top + e.h) continue;
      m = Math.min(m, q.top);
    }
    return Math.max(0, Math.min(e.h, e.top + e.h - m));
  };
  // how much of el the header hides at its top (px): cut exactly where the header meets the image
  const topCut = (el, base, front) => { const e = rectIn(el, base), m = Math.max(-Infinity, ...bandsOf(el, base, front).map(x => x.bottom)); return Math.max(0, Math.min(e.h, m - e.top)); };
  // the travelling image: a copy resting at T's box, flown from S by transform (translate + scale, sharedMs / sharedEasing); its
  // top is cut where the header met it (cS at the start, cT at the end, px), the cut part of the image itself (it moves and scales
  // with it, never slides under anything). The cut: an overflow-hidden window moved down by the cut, the image in it moved back up
  // by the same — transforms only, no clip-path. Corners on the innermost element.
  // bS / bT: the same at the bottom (album pages: where the peek / nav bar meets it), a second window moved up, the image moved back down.
  function cutCopy(base, bg, S, T, cS = 0, cT = 0, bS = 0, bT = 0) {
    const root = document.createElement('div'), fl = document.createElement('div'), win = document.createElement('div'), winB = document.createElement('div'), art = document.createElement('div');
    const sx = S.w / T.w, sy = S.h / T.h, start = 'translate(' + (S.left - T.left) + 'px,' + (S.top - T.top) + 'px) scale(' + sx + ',' + sy + ')';
    const rad = (r, kx, ky) => (r / kx).toFixed(2) + 'px / ' + (r / ky).toFixed(2) + 'px', c0 = cS / sy, b0 = bS / sy;
    root.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:' + OVERLAY + ';pointer-events:none';
    fl.style.cssText = 'position:absolute;left:' + T.left + 'px;top:' + T.top + 'px;width:' + T.w + 'px;height:' + T.h + 'px;transform-origin:0 0;will-change:transform;transform:' + start;
    win.style.cssText = 'position:absolute;inset:0;overflow:hidden;transform:translateY(' + c0 + 'px)';
    winB.style.cssText = 'position:absolute;inset:0;overflow:hidden;transform:translateY(' + (-c0 - b0) + 'px)';
    art.style.cssText = 'position:absolute;inset:0;background:' + bg + ';border-radius:' + rad(S.rad, sx, sy) + ';transform:translateY(' + b0 + 'px)';
    winB.appendChild(art); win.appendChild(winB); fl.appendChild(win); root.appendChild(fl); base.appendChild(root);
    const anims = [];
    const run = d => {
      const ms = d.sharedMs || 0, ez = d.sharedEasing || E(), es = easing(ez), o = { duration: ms, easing: ez, fill: 'forwards' };
      const fly = fl.animate([{ transform: start }, { transform: 'none' }], o);
      anims.push(fly, win.animate([{ transform: 'translateY(' + c0 + 'px)' }, { transform: 'translateY(' + cT + 'px)' }], o));
      const N = 12, kf = [];
      const kB = [];
      for (let k = 0; k <= N; k++) { const e = es(k / N), w = S.w + (T.w - S.w) * e, h = S.h + (T.h - S.h) * e, c = c0 + (cT - c0) * e, b = b0 + (bT - b0) * e; kf.push({ offset: k / N, transform: 'translateY(' + b + 'px)', borderRadius: rad(S.rad + (T.rad - S.rad) * e, w / T.w, h / T.h) }); kB.push({ offset: k / N, transform: 'translateY(' + (-c - b) + 'px)' }); }
      anims.push(art.animate(kf, { duration: ms, easing: 'linear', fill: 'forwards' }), winB.animate(kB, { duration: ms, easing: 'linear', fill: 'forwards' }));
      return fly;
    };
    return { root, run, anims };
  }
  // the back layer's fixed header parts: { key, el, r }
  const fixedParts = (root, base) => root ? [...root.querySelectorAll('[data-fixed]')].filter(el => el.getClientRects().length).map(el => ({ key: el.getAttribute('data-fixed'), el, r: rectIn(el, base) })) : [];
  // everything under root except the fixed parts (and their ancestors' own boxes): what cross-fades
  const loose = root => { const out = [], walk = n => { for (const c of n.children) { if (c.hasAttribute('data-fixed')) continue; if (c.querySelector('[data-fixed]')) walk(c); else out.push(c); } }; walk(root); return out; };
  // a still copy of a fixed part where it is, in its inherited ink / type (stands in while the page changes under it)
  const ghostOf = (p, base) => {
    const g = p.el.cloneNode(true), cs = getComputedStyle(p.el);
    g.removeAttribute('data-fixed');
    g.style.removeProperty('inset-inline-start');
    Object.assign(g.style, { position: 'absolute', left: p.r.left + 'px', top: p.r.top + 'px', width: p.r.w + 'px', height: p.r.h + 'px', maxWidth: 'none', margin: '0', zIndex: String(OVERLAY - 1), pointerEvents: 'none', transition: 'none',
      color: cs.color, fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, lineHeight: cs.lineHeight, direction: cs.direction, boxSizing: 'border-box' });
    base.appendChild(g);
    return g;
  };
  // the new page's parts slide in after the shared image, one after another (els in order; enterStagger apart, from enterDistance below)
  function staggerIn(d, els) {
    if (!d || d.kind === 'instant' || !d.enterStagger) return;
    els.filter(Boolean).forEach((el, k) => el.animate([{ opacity: 0, transform: 'translateY(' + (d.enterDistance || 0) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: d.enterMs || 0, delay: (d.enterDelay || 0) + k * d.enterStagger, easing: d.enterEasing || E(), fill: 'backwards' }));
  }
  // role 'detail': the page's own image (DetailHeader) — not an item image in its list
  const sharedIn = (root, name = 'image', role) => (root && root.querySelector('[data-shared="' + name + '"]' + (role ? '[data-shared-role="' + role + '"]' : ''))) || null;

  // ── expandSurface (app-bar page): surface + page clipped from the front layer's shape to the content area; front content
  // fades out, page fades in. reverse: the clip shrinks back and the page fades out while the front content fades in.
  // surfaceTo: where the surface lands when the page's own top differs from its surface (an app bar whose top row sits on
  // back-layer colours: the front-coloured surface only grows into the sheet below it).
  function expandSurface(key, d, { surface, page, content, from, to, surfaceTo, reverse }) {
    cancel(key);
    const P = timing(d), st = surfaceTo || to, t = { duration: d.ms, easing: d.easing, fill: 'forwards' };
    const clip = reverse ? [{ clipPath: to }, { clipPath: from }] : [{ clipPath: from }, { clipPath: to }], sclip = reverse ? [{ clipPath: st }, { clipPath: from }] : [{ clipPath: from }, { clipPath: st }];
    // the page fades as its parts: the sheet's own fill and corners stay solid (they slide with the surface), only what is on it fades
    const pg = page && page.firstChild ? pageParts(page, d) : [], leave = reverse ? pg : [content].filter(Boolean), enter = reverse ? [content].filter(Boolean) : pg;
    const outs = fadeOut(P, leave), ins = fadeIn(P, enter, true), band = revealBand(d, page, content, reverse, t);
    anims[key] = [
      surface && surface.animate(sclip, t), page && !band && page.animate(clip, t), ...(band ? [band] : []),
      ...(slides(d, 'sheet') ? sheetSlide(page, content, reverse, t) : []), ...outs,
      ...ins
    ];
    const go = whenOut(P, outs, () => ins.forEach(a => a.play()));
    // fade through: the old content stays out until the new is in (push: then released, under the page)
    const total = Math.max(d.ms || 0, P.OUT + P.IN);
    timers[key] = { a: go, b: !reverse && outs.length ? setTimeout(() => outs.forEach(a => a.cancel()), total) : null };
    return total;
  }
  // revealBand (px): the page doesn't grow from the front layer's shape. It is shown only in its top revealBand px (still) and
  // from its sheet's top down — that edge moves with the sheet (from the front layer's top, same ms / easing); nothing else moves.
  const revealBand = (d, page, content, reverse, t) => {
    if (!d.revealBand || !page) return null;
    const sh = page.querySelector('[data-sheet]'), fr = content && content.parentElement, P0 = page.getBoundingClientRect().top;
    const y1 = (sh ? sh.getBoundingClientRect().top : P0) - P0, y0 = fr ? fr.getBoundingClientRect().top - P0 : y1, b = d.revealBand;
    const shape = y => 'polygon(0px 0px, 100% 0px, 100% ' + b + 'px, 0px ' + b + 'px, 0px ' + y + 'px, 100% ' + y + 'px, 100% 100%, 0px 100%)';
    const k = [{ clipPath: shape(y0) }, { clipPath: shape(y1) }];
    return page.animate(reverse ? k.reverse() : k, reverse ? t : { ...t, fill: 'backwards' });
  };
  // what of an app-bar page fades: the design names its parts (expandSurface fadeParts: data-part names, 'sheetContent' = what
  // is on the sheet); nothing named: the page's content as a whole. Parts not named (fills, the sheet) stay solid.
  const pageParts = (page, d) => {
    const names = String(d.fadeParts || '').split(/\s+/).filter(Boolean);
    if (!names.length) return [page.firstChild];
    const sh = page.querySelector('[data-sheet]');
    return names.flatMap(n => n === 'sheetContent' ? (sh ? [...sh.children] : []) : [...page.querySelectorAll('[data-part="' + n + '"]')]);
  };
  const slides = (d, part) => String(d.slideParts || '').split(/\s+/).includes(part);
  // the page's sheet ([data-sheet], AppBarSheet) starts where the front layer is and slides to its place with the surface (same
  // ms / easing); reverse: back down onto the front layer
  const sheetSlide = (page, content, reverse, t) => {
    const sh = page && page.querySelector('[data-sheet]'), fr = content && content.parentElement;
    if (!sh || !fr) return [];
    const dy = fr.getBoundingClientRect().top - sh.getBoundingClientRect().top;
    if (Math.abs(dy) < 0.5) return [];
    const k = [{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }];
    return [sh.animate(reverse ? k.reverse() : k, reverse ? t : { ...t, fill: 'backwards' })];
  };
  const clipShape = (top, corners, cornerTo) => corners ? 'inset(' + top + 'px 0px 0px 0px round ' + corners + ' 0px 0px)' : 'inset(0px 0px 0px 0px round ' + (cornerTo ?? 0) + 'px)';

  // ── enterApp: the cover's logo flies into the app's logo (or the sign-in logo); the cover fades; layers rise in, staggered.
  // els: { base, bg, text, logo, target, toGate, back, front: [], side: [], bottom: [], peek: [] }
  function enterApp(key, d, els) {
    cancel(key);
    const ms = d.ms || 0, lm = d.logoMs || ms, L = d.layerMs || ms, st = d.stagger || 0, pst = d.peekStagger ?? st, ease = d.easing || E(), eo = d.easingOut || ease, A = [];
    const shown = el => el && el.getBoundingClientRect().width > 0;
    const fade = el => el && A.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: eo, fill: 'forwards' }));
    fade(els.bg); fade(els.text);
    let hidden = null;
    if (els.logo && els.base && shown(els.target)) {
      const a = rectIn(els.logo, els.base), b = rectIn(els.target, els.base);
      hidden = els.target; hidden.style.visibility = 'hidden';
      els.logo.style.transformOrigin = '0 0';
      A.push(els.logo.animate([{ transform: 'none', color: getComputedStyle(els.logo).color }, { transform: 'translate(' + (b.left - a.left) + 'px,' + (b.top - a.top) + 'px) scale(' + (b.h / (a.h || 1)) + ')', color: getComputedStyle(els.target).color }], { duration: lm, easing: d.logoEasing || ease, fill: 'forwards' }));
    } else fade(els.logo);
    if (!els.toGate) {
      const dist = d.distance || 0, rise = (el, from, delay) => el && A.push(el.animate([{ opacity: 0, translate: from }, { opacity: 1, translate: '0 0' }], { duration: L, delay, easing: ease, fill: 'backwards' }));
      rise(els.back, '0 ' + dist + 'px', ms);
      (els.front || []).forEach(el => rise(el, '0 ' + dist + 'px', ms + st));
      (els.side || []).forEach(el => rise(el, -dist + 'px 0', ms + 2 * st));
      (els.bottom || []).forEach(el => rise(el, '0 ' + dist + 'px', ms + 2 * st));
      (els.peek || []).forEach(el => rise(el, '0 ' + dist + 'px', ms + 2 * st + pst));
    }
    anims[key] = A;
    const total = Math.max(lm, ms + 2 * st + pst + L);
    return { total, hidden, done: Promise.all(A.map(x => x.finished.catch(() => {}))) };
  }

  // ── dropIntoPeek (event queued): the item's image → a small square on its corner nearest the peek → slides, falls into the
  // peek's destination for the position (now: its image · next: beside it, then tucked behind · last: after its last control).
  // els: { base, src, peek } — peek holds [data-peek="art" | "title" | "subtitle" | "controls"] (NowPlaying). position from the event.
  function dropIntoPeek(d, position, { base, src, peek }) {
    if (!d || d.kind !== 'dropIntoPeek' || !base || !src || !peek) return;
    const q = n => peek.querySelector('[data-peek="' + n + '"]'), art = q('art'), title = q('title'), sub = q('subtitle'), ctl = q('controls');
    if (!art || !src.getBoundingClientRect().width) return;
    // the peek may still be mid-bounce (or mid-slide) from an earlier drop: measure where it rests, not where it is drawn
    (peek.getAnimations ? peek.getAnimations() : []).forEach(x => x.finish && x.cancel());
    [art, peek].forEach(el => el.getAnimations && el.getAnimations().forEach(x => x.cancel()));
    const A = rectIn(src, base), R = rectIn(art, base), size = R.w, P = rectIn(peek, base);
    const lastBtn = ctl && ctl.lastElementChild, LB = lastBtn ? rectIn(lastBtn, base) : null;
    const room = title ? rectIn(title, base).left - R.left : size;   // art → text start: the space a tile takes in the row
    // destination square
    const T = position === 'next' ? { left: R.left + room, top: R.top } : position === 'last' && LB ? { left: LB.left + (LB.w - size) / 2, top: R.top } : { left: R.left, top: R.top };
    const g = document.createElement('div'), cs = getComputedStyle(src), rad = getComputedStyle(art).borderRadius;
    g.style.cssText = 'position:absolute;z-index:' + OVERLAY + ';pointer-events:none;left:0;top:0;width:' + size + 'px;height:' + size + 'px;background:' + (src.style.background || cs.background) + ';border-radius:' + rad + ';box-shadow:' + (d.dropShadow || 'none') + ';will-change:transform';
    base.appendChild(g);
    const at = (x, y, sc = 1) => 'translate(' + x + 'px,' + y + 'px) scale(' + sc + ')';
    const clean = el => el && el.getAnimations().forEach(x => x.cancel());
    const run = (el, kf, ms, easing, delay = 0) => el ? el.animate(kf, { duration: ms || 0, easing: easing || E(), delay, fill: 'forwards' }) : null;
    g.style.transformOrigin = '0 0';
    // one throw from the tap, its centre on one path: straight up from the original's centre, a semicircle as wide as the
    // horizontal distance (its top = the apex), straight down onto the destination's centre. Apex (the tiny square's top):
    // riseHeight above the original's top, or minFallHeight above the destination if higher (raised further only if the circle's
    // middle would sit below the start). The lines meet the circle tangentially, so the path is smooth and the vertical speed is 0
    // at the apex. The run goes by distance along the path (lines + π·r), eased once (throwEasing), over msPerPx × its length.
    // It shrinks into the peek's square by the apex (shrinkEasing); clipped by the peek until then.
    const px = v => { const n = parseFloat(v) || 0; return String(v).endsWith('%') ? n / 100 * Math.min(A.w, A.h) : n; };
    const r0 = Math.min(px(cs.borderTopLeftRadius), Math.min(A.w, A.h) / 2), r1 = parseFloat(rad) || 0;
    const C0 = { x: A.left + A.w / 2, y: A.top + A.h / 2 }, CT = { x: T.left + size / 2, y: T.top + size / 2 };
    const D = CT.x - C0.x, R0 = Math.abs(D) / 2, dir = D >= 0 ? 1 : -1, Mx = (C0.x + CT.x) / 2;
    const aS = A.top - (d.riseHeight || 0), aD = T.top - (d.minFallHeight || 0), apex = d.apex === 'start' ? aS : d.apex === 'destination' ? aD : Math.min(aS, aD);
    const yc = Math.min(C0.y, CT.y, apex + size / 2 + R0);   // the circle's middle
    const L1 = C0.y - yc, L2 = Math.PI * R0, L3 = CT.y - yc, Ltot = L1 + L2 + L3, sA = L1 + L2 / 2;
    const on = s => s <= L1 ? { x: C0.x, y: C0.y - s } : s <= L1 + L2 ? (f => ({ x: Mx - dir * R0 * Math.cos(f), y: yc - R0 * Math.sin(f) }))(R0 ? (s - L1) / R0 : 0) : { x: CT.x, y: yc + (s - L1 - L2) };
    const flyMs = (d.msPerPx || 0) * Ltot, tez = easing(d.throwEasing || E()), sez = easing(d.shrinkEasing || E()), NK = 96, kf = [], L = (x, y, e) => x + (y - x) * e;
    // the moment it reaches the apex: the eased run's progress = sA / Ltot
    let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (tez(m) < (Ltot ? sA / Ltot : 1)) lo = m; else hi = m; }
    const uA = hi;
    for (let i = 0; i <= NK; i++) {
      const u = i / NK, e = uA > 0 ? sez(Math.min(1, u / uA)) : 1, w = L(A.w, size, e), h = L(A.h, size, e), c = on(Ltot * tez(u));
      const left = c.x - w / 2, top = c.y - h / 2, ov = u < uA ? Math.max(0, Math.min(h, top + h - P.top)) : 0;
      kf.push({ offset: u, left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px', borderRadius: L(r0, r1, e) + 'px', clipPath: 'inset(0px 0px ' + ov.toFixed(1) + 'px 0px)' });
    }
    g.style.transform = 'none'; g.style.left = A.left + 'px'; g.style.top = A.top + 'px'; g.style.width = A.w + 'px'; g.style.height = A.h + 'px'; g.style.borderRadius = r0 + 'px';
    run(g, kf, flyMs, 'linear');
    // tiny at the apex: the make-room slides start there
    const tA = flyMs * uA, tF = flyMs;
    // the peek was empty (nothing playing): its image appears only once the falling image lands
    const empty = art.getAttribute('data-empty') === '1' || Date.now() - (+art.getAttribute('data-filled-at') || 0) < tF;   // empty, or filled by this very play
    if (empty) { art.style.visibility = 'hidden'; setTimeout(() => { art.style.visibility = ''; }, tF); }
    // (c) make room while it travels
    const texts = [title, sub].filter(Boolean), roomMs = d.makeRoomMs || 0;
    if (position === 'next') texts.forEach(el => run(el, [{ transform: 'none' }, { transform: 'translateX(' + room + 'px)' }], roomMs, d.makeRoomEasing, tA));
    // last: every control slides aside together (controlStagger apart, the leading one first); a cover in the peek's colour rides
    // under the leading control, clipping the text behind it and casting coverShadow on it
    const btns = ctl ? [...ctl.children] : [], st = d.controlStagger || 0;
    let cover = null;
    if (position === 'last' && btns.length) {
      const pb = (() => { for (let n = peek; n && n !== base.parentElement; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return ''; })();
      const lead = rectIn(btns[0], base);
      cover = document.createElement('div');
      cover.style.cssText = 'position:absolute;top:0;bottom:0;right:0;left:' + (lead.left - P.left) + 'px;pointer-events:none;z-index:1;background:' + pb;
      peek.insertBefore(cover, ctl);
      // its shadow shows only while it covers text: from the moment its edge passes the text's right end (measured glyphs, not the box)
      const textEnd = Math.max(0, ...texts.map(el => { const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(), bb = base.getBoundingClientRect(); return b.width ? (b.right - bb.left) * (base.offsetWidth / (bb.width || 1)) : 0; }));
      const f = Math.max(0, Math.min(1, (lead.left - textEnd) / (room || 1))), sh = d.coverShadow || 'none';
      cover._shadow = f < 1 ? [{ boxShadow: 'none', offset: 0 }, { boxShadow: 'none', offset: f }, { boxShadow: sh, offset: Math.min(1, f + d.coverShadowRamp) }, { boxShadow: sh, offset: 1 }] : [{ boxShadow: 'none', offset: 0 }, { boxShadow: 'none', offset: 1 }];
      const n = btns.length, ord = k => d.controlOrder === 'startFirst' ? k : n - 1 - k, leadDelay = ord(0) * st;   // controlOrder: which control moves first; the cover rides with the leading one
      run(cover, cover._shadow.map((k, i) => ({ ...k, transform: 'translateX(' + (-room * k.offset) + 'px)' })), roomMs, d.makeRoomEasing, tA + leadDelay);
      btns.forEach((b, k) => run(b, [{ transform: 'none' }, { transform: 'translateX(' + (-room) + 'px)' }], roomMs, d.makeRoomEasing, tA + ord(k) * st));
    }
    setTimeout(() => {   // hit: the peek springs down and back
      if (position === 'next') {
        // the copy moves into the peek, just behind its image (same box, z below the art): it bounces with the peek as part of
        // it, then slides under the art, which simply covers it (no clip) and casts tuckShadow on it while it does
        const p = rectIn(peek, base), x = T.left - p.left, y = T.top - p.top, o0 = x - (R.left - p.left), t = d.closeMs || 0, h = d.holdMs || 0;
        g.getAnimations().forEach(z => z.cancel());   // their end values set inline (corners included)
        g.style.left = x + 'px'; g.style.top = y + 'px'; g.style.transform = 'none'; g.style.clipPath = ''; g.style.zIndex = '0'; g.style.borderRadius = rad;
        g.style.width = size + 'px'; g.style.height = size + 'px';
        peek.insertBefore(g, art);
        const kf = [{ transform: 'translateX(0px)' }, { transform: 'translateX(' + (-o0) + 'px)' }];
        run(art, [{ boxShadow: 'none' }, { boxShadow: d.tuckShadow || 'none', offset: d.tuckShadowIn }, { boxShadow: d.tuckShadow || 'none', offset: d.tuckShadowOut }, { boxShadow: 'none' }], t, d.closeEasing, h).onfinish = () => clean(art);
        run(peek, [{ transform: 'none' }, { transform: 'translateY(' + (d.bounce || 0) + 'px)', offset: d.bounceAt }, { transform: 'none' }], d.bounceMs, d.bounceEasing).onfinish = () => clean(peek);
        // the same close as last: rest holdMs, then the image slides under the art and the text slides back together (closeMs, closeEasing)
        run(g, kf, t, d.closeEasing, h);
        texts.forEach((el, k) => run(el, [{ transform: 'translateX(' + room + 'px)' }, { transform: 'none' }], t, d.closeEasing, h + k * (d.stagger || 0)).onfinish = () => clean(el));
        return setTimeout(() => g.remove(), h + t + texts.length * (d.stagger || 0));
      }
      run(peek, [{ transform: 'none' }, { transform: 'translateY(' + (d.bounce || 0) + 'px)', offset: d.bounceAt }, { transform: 'none' }], d.bounceMs, d.bounceEasing).onfinish = () => clean(peek);
      // the landed image rides the peek's spring (added on top of whatever else moves it), so it stays aligned with the peek's image
      g.animate([{ transform: 'translateY(0px)' }, { transform: 'translateY(' + (d.bounce || 0) + 'px)', offset: d.bounceAt }, { transform: 'translateY(0px)' }], { duration: d.bounceMs || 0, easing: d.bounceEasing || E(), composite: 'add' });
      if (position === 'now') return setTimeout(() => g.remove(), d.bounceMs || 0);
      if (position === 'last' && btns.length) {   // rest, then the controls slide back over it (the trailing one first), the cover with the leading one
        const h = d.holdMs || 0, cm = d.closeMs || 0, n = btns.length, ord = k => d.controlOrder === 'startFirst' ? k : n - 1 - k;
        btns.forEach((b, k) => run(b, [{ transform: 'translateX(' + (-room) + 'px)' }, { transform: 'none' }], cm, d.closeEasing, h + ord(k) * st).onfinish = () => clean(b));   // rightmost first again
        run(cover, [...cover._shadow].reverse().map(k => ({ boxShadow: k.boxShadow, offset: 1 - k.offset, transform: 'translateX(' + (-room * k.offset) + 'px)' })), cm, d.closeEasing, h + ord(0) * st);
        // hidden exactly where the trailing control (first to move, same easing / delay) has reached it: cut = its right edge − the
        // image's left, clamped — keyframes at the eased progress where that crosses 0 and size. Done with transforms only (an
        // overflow-hidden window moving right by cut, the image inside moving left by cut) so it stays in step with the controls'
        // composited transforms; a clip-path runs on the main thread and visibly lags / stutters against them.
        // the cut runs cutOverlap px past the image (OVER) so no antialiased sliver is left to snap away at the end
        const OVER = d.cutOverlap || 0, edge = p => Math.max(0, Math.min(size + OVER, LB.left + LB.w - room - T.left + (room + OVER) * p));
        const c0 = LB.left + LB.w - room - T.left, sl = (room + OVER) || 1;   // edge(p) = clamp(c0 + sl·p): its kinks where it leaves 0 and reaches size + OVER
        const ks = [...new Set([0, 1, -c0 / sl, (size + OVER - c0) / sl].filter(o => o >= 0 && o <= 1))].sort((x, y) => x - y);
        const shade = document.createElement('div'), sw = d.shadeWidth || 0, win = document.createElement('div');
        shade.style.cssText = 'position:absolute;top:0;bottom:0;left:' + (-sw) + 'px;width:' + sw + 'px;pointer-events:none;background:linear-gradient(to right, ' + (d.shade || 'transparent') + ', transparent)';
        setTimeout(() => {
          if (!g.isConnected) return;
          const gr = rectIn(g, base);
          g.getAnimations().forEach(z => z.cancel());
          win.style.cssText = 'position:absolute;z-index:' + OVERLAY + ';pointer-events:none;overflow:hidden;left:' + gr.left + 'px;top:' + gr.top + 'px;width:' + gr.w + 'px;height:' + gr.h + 'px;will-change:transform';
          g.style.left = '0px'; g.style.top = '0px'; g.style.width = gr.w + 'px'; g.style.height = gr.h + 'px'; g.style.borderRadius = rad; g.style.clipPath = ''; g.style.transform = 'none'; g.style.overflow = 'hidden';
          base.appendChild(win); win.appendChild(g); g.appendChild(shade);
          run(win, ks.map(o => ({ offset: o, transform: 'translateX(' + edge(o).toFixed(2) + 'px)' })), cm, d.closeEasing);
          run(g, ks.map(o => ({ offset: o, transform: 'translateX(' + (-edge(o)).toFixed(2) + 'px)' })), cm, d.closeEasing);
          run(shade, ks.map(o => ({ offset: o, transform: 'translateX(' + (edge(o) + sw).toFixed(2) + 'px)' })), cm, d.closeEasing);
        }, h);
        return setTimeout(() => { g.remove(); win.remove(); cover && cover.remove(); }, h + cm + (n - 1) * st);
      }
      g.remove();
    }, tF);
  }

  // scroll-driven moves: a user's scroll moves bars directly (no transition); a scroll the shell sets (restoring a page's
  // position after a change) must not count as one, or it would cancel that change's motion
  const restoring = new WeakSet();
  function restoreScroll(el, top) { if (Math.abs(el.scrollTop - top) <= 1) return false; restoring.add(el); el.scrollTop = top; return true; }
  function userScrolled(el) { if (restoring.has(el)) { restoring.delete(el); return false; } return true; }
  const forMove = (d, lastMove) => lastMove === 'scroll' ? NONE : cssAll(d);

  function cancel(key) { (anims[key] || []).forEach(a => a && a.cancel()); delete anims[key]; }

  // demo slow motion (debug, not design): every duration in a descriptor × 2^step; step from localStorage SLOW_KEY (0 = real speed)
  const slow = () => { try { return Math.pow(2, Math.max(0, +localStorage.getItem(SLOW_KEY) || 0)); } catch (e) { return 1; } };
  const TIMED = /^(ms|stagger|fallScale)$|Ms$|Stagger$|Delay$/;
  const scaleD = (d, f) => { if (!d || typeof d !== 'object' || Array.isArray(d)) return d; const o = { ...d }; for (const k in o) if (TIMED.test(k) && typeof o[k] === 'number') o[k] *= f; return o; };
  const slowed = fn => typeof fn !== 'function' ? fn : (...args) => { const f = slow(); return f === 1 ? fn(...args) : fn(...args.map(x => !x || typeof x !== 'object' || Array.isArray(x) ? x : ('kind' in x || 'inMs' in x) ? scaleD(x, f)
    : Object.values(x).some(v => v && typeof v === 'object' && 'kind' in v) ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v && typeof v === 'object' && 'kind' in v ? scaleD(v, f) : v])) : x)); };
  const api = { timing, msOf, easeOf, easing, css, cssAll, cssFor, flash, pulse, NONE, rectIn, phased, cover, coverStyle, sharedFlight, detailTransition, sharedIn, expandSurface, clipShape, enterApp, dropIntoPeek, staggerIn, restoreScroll, userScrolled, forMove, cancel, clear };
  Object.keys(api).forEach(k => { if (k !== 'rectIn' && k !== 'easing' && k !== 'sharedIn' && k !== 'clipShape' && k !== 'cancel') api[k] = slowed(api[k]); });
  return api;
}

import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

if (typeof document !== 'undefined' && !document.getElementById('sonora-frontlayer-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-frontlayer-css';
  // Light is the base rule and dark the override, so an unthemed context gets the edge that cannot
  // invert: `--surface-border` reads on either surface, the `--surface-fg` mix only where the
  // foreground is light. Theme is `data-theme` on an ancestor, so this cannot be an inline style.
  el.textContent = '.sn-front-edge{box-shadow:inset 0 1px 0 var(--surface-border)}'
    + '[data-theme="dark"] .sn-front-edge{box-shadow:inset 0 1px 0 color-mix(in srgb, var(--surface-fg) 16%, transparent)}';
  document.head.appendChild(el);
}

/** The backdrop's front layer: the 1dp --surface-bg surface holding primary content, with a fixed subheader above it and permanently rounded top corners. Owns the scrolling and the per-view scroll memory. */
export function FrontLayer({ children, subheader, scroll = true, scrollKey, onProgress, threshold = 24, squareLeft = false, squareRight = false, flat = false, platform = 'desktop' }) {
  const [p, setP] = React.useState(0);
  const scroller = React.useRef(null);
  const root = React.useRef(null);
  const saved = React.useRef({});
  const lastKey = React.useRef(scrollKey);
  const { ScrollArea } = NS();
  // In `scroll={false}` mode the scrolling element belongs to the page, not to us, and it is a new
  // element after every view change — so it is looked up rather than held.
  const pageScroller = () => {
    if (scroller.current) return scroller.current;
    const el = root.current;
    if (!el) return null;
    const all = el.querySelectorAll('*');
    // Last match, not first: when a detail page floats over the view beneath, the overlay's scroller
    // is the one on screen.
    let found = null;
    for (let i = 0; i < all.length; i++) {
      const n = all[i], oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) found = n;
    }
    return found;
  };
  /* Per-view scroll memory. The offset is recorded as the user scrolls rather than read back when
     the view changes: by the time an effect runs, the incoming (often shorter) content has already
     been laid out and the browser has clamped scrollTop to the new maximum, destroying the value
     we wanted to save. Restoring is retried on the next frame because content that is still
     laying out — images, fonts — can clamp the restore the same way. */
  React.useLayoutEffect(() => {
    if (scrollKey === lastKey.current) return;
    lastKey.current = scrollKey;
    const target = saved.current[scrollKey] || 0;
    const apply = () => { const el = pageScroller(); if (el && el.scrollTop !== target) el.scrollTop = target; };
    apply();
    const id = requestAnimationFrame(apply);
    const prog = Math.min(1, target / threshold);
    setP(prog);
    if (onProgress) onProgress(prog);
    return () => cancelAnimationFrame(id);
  }, [scrollKey, threshold, onProgress]);
  const track = (e) => {
    // In `scroll={false}` mode this fires via capture from any descendant scroller, including
    // horizontal shelves — ignore those, or a sideways swipe would reset the corner state.
    const el = e.target;
    if (!el || el.scrollHeight <= el.clientHeight + 1) return;
    saved.current[lastKey.current] = el.scrollTop;
    const next = Math.min(1, (el.scrollTop || 0) / threshold);
    setP(next);
    if (onProgress) onProgress(next);
  };
  /* A backdrop's front layer is a persistent surface, not a sheet that docks: the top corners are
     --radius-lg at every scroll position and the 1dp step is expressed by the layer's own top
     edge, not by the scroll-linked hairline a docking sheet flattens into. Only an abutting panel
     squares an edge. */
  const r = (sq) => (sq ? '0' : 'var(--radius-lg)');
  /* How the 1dp step is expressed. `--shadow-sm` is `0 1px 3px` — cast DOWNWARD, away from the top
     edge, which is the only place this layer meets the back layer. Measured off a render
     (`docs/lift_probe.mjs`), what it lands on the back layer just above that boundary is ONE value
     out of 255 in dark and at most three in light: neither theme is really being separated by the
     shadow, only by the tonal step, #080808 -> #141414 or #FFFFFF -> #F9F6F6. Light holds because
     that pair differs in hue as well as level; near black a display's black floor flattens the
     other pair, which is the "no shadow on black" problem. Enlarging the shadow cannot fix it —
     `--shadow-xxl` still only reaches #070707, just over 25px instead of 2 — so a light 1px edge is
     drawn along the top over the drop shadow, which stays underneath in both themes.
     That edge is themed because a `--surface-fg` mix is a highlight only where the foreground is
     light: #343434 on #141414 in dark, but inverting into an inner *shadow* in light (#D5D2D2 on
     #F9F6F6). So dark takes the mix and light takes `--surface-border`, which reads on either
     surface — the two rules are in `sonora-frontlayer-css` above. */
  /* `flat` is no backdrop at all: the layer is square, casts nothing, and meets the app bar above
     it on the same surface, marked only by a hairline once the content scrolls under the bar. */
  const surface = sx(
    'position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;' +
    'background:var(--surface-bg);overflow:hidden;' + (flat ? '' : 'box-shadow:var(--shadow-sm);') +
    'border-radius:' + (flat ? '0' : r(squareLeft) + ' ' + r(squareRight) + ' 0 0')
  );
  /* Drawn as an overlay rather than an inset shadow on the surface itself: the subheader is an
     opaque `--surface-bg` child sitting exactly on the top edge, and it would paint over an inset
     shadow belonging to its parent. `border-radius:inherit` makes the edge follow the layer's own
     corners, including a squared one where a panel abuts — so it reads as the layer's edge rather
     than as a rule laid across it. */
  const edge = flat
    ? <span aria-hidden="true" style={sx('position:absolute;left:0;right:0;top:0;height:1px;z-index:3;pointer-events:none;background:var(--surface-border);opacity:' + p)} />
    : <span aria-hidden="true" className="sn-front-edge"
      style={sx('position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:inherit')} />;
  // The subheader's divider is scroll-linked, and only the layer that owns the scroller knows how
  // far it has gone — so progress is handed down rather than asked for. An explicit `progress`
  // (a card showing the scrolled state statically) is left alone.
  const head = React.isValidElement(subheader)
    ? React.cloneElement(subheader, Object.assign(
        subheader.props.progress === undefined ? { progress: p } : {},
        subheader.props.platform === undefined ? { platform } : {}
      ))
    : subheader;
  const body = scroll
    ? <ScrollArea scrollRef={scroller} onScroll={track}>{children}</ScrollArea>
    : children;
  if (!scroll) return <div ref={root} onScrollCapture={track} style={surface}>{head}{body}{edge}</div>;
  return <div ref={root} style={surface}>{head}{body}{edge}</div>;
}

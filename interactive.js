// Web platform helper for every interactive component (design/components/interactive): one implementation of
// the state input (hover / press / focus), the state layer, ripples, focus ring, press scale and the base
// state-transition motions. Component DCs (IconButton, Button, Chip, Tab, NavItem, ListItem, ListRow, GridCard,
// ContentBlock) delegate to it and add only their own content. Loaded as a classic script: window.DCInteractive.
// Props from the shell: id (slot path), label, resolve(input) → InteractionView (core §20), look(state, status) →
// visuals (design), activate(event), dim, motion (press ripple), motions (per key: stateLayer, scale, focusRing,
// rotation, icon, levels — design §15).
(function () {
  const motion = (c, k) => ((c.props.motions || {})[k]) || {};
  const set = (c, p) => c.setState(s => ({ input: { ...(s.input || {}), ...p } }));
  const view = c => { const r = c.props.resolve; return r ? r((c.state && c.state.input) || {}) : { state: 'disabled', enabled: false, activatable: false, flags: {}, status: [] }; };
  const look = (c, st, status) => c.props.look ? c.props.look(st, status || []) || {} : {};
  function drop(c) { if (c._offUp) c._offUp(); (c._rips || []).forEach(b => b.remove()); c._rips = []; c._endRipple = null; }
  function ripple(c, e, strength) {
    const el = c.rootRef.current; if (!el || !strength) return;
    const m = c.props.motion || {}; if (m.kind === 'instant') return;
    const ms = m.ms || 450, ease = m.easing || 'ease-out';
    const r = el.getBoundingClientRect(), k = el.offsetWidth / (r.width || 1);
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, w = el.offsetWidth, h = el.offsetHeight;
    const R = Math.ceil(Math.hypot(Math.max(x, w - x), Math.max(y, h - y)));
    const box = document.createElement('span'), dot = document.createElement('span');
    box.style.cssText = 'position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none';
    dot.style.cssText = 'position:absolute;left:' + (x - R) + 'px;top:' + (y - R) + 'px;width:' + 2 * R + 'px;height:' + 2 * R + 'px;border-radius:50%;background:currentColor;opacity:' + strength + ';transform:scale(0)';
    box.appendChild(dot); el.appendChild(box); (c._rips = c._rips || []).push(box);
    const grow = dot.animate([{ transform: 'scale(.15)' }, { transform: 'scale(1)' }], { duration: ms, easing: ease, fill: 'forwards' });
    c._endRipple = () => {
      const fade = () => { const f = dot.animate([{ opacity: strength }, { opacity: 0 }], { duration: Math.round(ms * .5), easing: ease, fill: 'forwards' }); f.onfinish = () => { box.remove(); c._rips = (c._rips || []).filter(b => b !== box); }; };
      if (grow.playState === 'finished') fade(); else grow.onfinish = fade;
    };
  }
  function down(c, e) {
    e.stopPropagation();
    const v = view(c); if (!v.activatable) return;
    set(c, { pressed: true });
    ripple(c, e, look(c, 'pressed', v.status).ripple);
    const up = () => { c._offUp(); set(c, { pressed: false }); if (c._endRipple) { c._endRipple(); c._endRipple = null; } };
    if (c._offUp) c._offUp();
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    c._offUp = () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); c._offUp = null; };
  }
  // symbolMorph (design motion): the old glyph shrinks and turns out, the new one grows and turns in
  function morphSymbol(el, m) {
    if (!el || !el.animate || m.kind === 'instant') return;
    const ms = m.ms || 250, ease = m.easing || 'ease';
    if (m.kind === 'fade') { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: ease }); return; }
    el.animate([{ transform: 'scale(.4) rotate(-90deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: ms, easing: ease });
  }
  function update(c, prev) {
    if (prev.id !== c.props.id) { drop(c); if (Object.keys((c.state && c.state.input) || {}).length) c.setState({ input: {} }); }
    if (prev.id === c.props.id && prev.icon && c.props.icon && prev.icon !== c.props.icon && c.iconRef) morphSymbol(c.iconRef.current, motion(c, 'icon'));
  }
  function base(c) {
    const v = view(c), vis = look(c, v.state, v.status), a = vis.stateLayer || 0;
    const tint = vis.stateLayerColor && vis.stateLayerColor !== 'content' ? vis.stateLayerColor : 'currentColor';
    const mix = 'color-mix(in srgb, ' + tint + ' ' + Math.round(a * 1000) / 10 + '%, transparent)';
    const fire = e => { if (v.activatable && c.props.activate) c.props.activate(e); };
    const ml = motion(c, 'stateLayer'), msc = motion(c, 'scale'), mf = motion(c, 'focusRing');
    const tr = (prop, m) => prop + ' ' + (m.kind === 'instant' ? 0 : m.ms || 0) + 'ms ' + (m.easing || 'ease');
    return {
      vis, rootRef: c.rootRef, status: (v.status || []).join(' '), busy: (v.status || []).includes('busy'), disabled: !v.enabled, tab: v.enabled ? 0 : -1, label: c.props.label || '',
      layerShadow: 'inset 0 0 0 999px ' + (a ? mix : 'transparent'),
      layerMs: ml.ms || 0, layerEase: ml.easing || 'ease',
      ixTrans: [tr('box-shadow', ml), tr('transform', msc), tr('outline-color', mf), tr('opacity', ml)].join(', '),
      pressScale: vis.scale ?? 1,
      outline: vis.focusRing ? '2px solid ' + vis.focusRing : '2px solid transparent',
      radius: (vis.radius ?? 0) + 'px', op: (vis.contentOpacity ?? 1) * (+(c.props.dim ?? 1)), cur: vis.cursor || 'default',
      onClick: e => { e.stopPropagation(); fire(e); },
      onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fire(e); } },
      onPointerEnter: () => set(c, { hovered: true }), onPointerLeave: () => set(c, { hovered: false }),
      onPointerDown: e => down(c, e),
      onFocus: e => { if (e.target === e.currentTarget) set(c, { focused: true, focusVisible: !!(e.target.matches && e.target.matches(':focus-visible')) }); },
      onBlur: e => { if (e.target === e.currentTarget) set(c, { focused: false, focusVisible: false }); }
    };
  }
  // before the script loads: inert values (a component re-renders on 'dc-interactive-ready')
  const pending = c => ({ vis: {}, rootRef: c.rootRef, status: '', busy: false, disabled: true, tab: -1, label: c.props.label || '', layerShadow: 'none', layerMs: 0, layerEase: 'ease', ixTrans: 'none', pressScale: 1, outline: 'none', radius: '0px', op: 1, cur: 'default', onClick: () => {}, onKeyDown: () => {}, onPointerEnter: () => {}, onPointerLeave: () => {}, onPointerDown: () => {}, onFocus: () => {}, onBlur: () => {} });
  window.DCInteractive = { base, update, drop, pending, morphSymbol };
  window.dispatchEvent(new Event('dc-interactive-ready'));
})();

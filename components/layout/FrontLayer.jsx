import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** The backdrop's front layer: the 1dp --surface-bg surface holding primary content, with a fixed subheader above it and permanently rounded top corners. Owns the scrolling and the per-view scroll memory. */
export function FrontLayer({ children, subheader, scroll = true, scrollKey, onProgress, threshold = 24, squareLeft = false, squareRight = false, lift = 'shadow', platform = 'desktop' }) {
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
     --radius-lg at every scroll position and the 1dp step is expressed by a shadow, not by a
     hairline. Only an abutting panel squares an edge. */
  const r = (sq) => (sq ? '0' : 'var(--radius-lg)');
  /* How the 1dp step is expressed, and why there is a choice at all. `--shadow-sm` is
     `0 1px 3px` — cast DOWNWARD, away from the top edge, which is the only place this layer meets
     the back layer. Measured off a render (`docs/lift_probe.mjs`), what it lands on the back
     layer just above that boundary is one value out of 255 in dark and at most three in light:
     neither theme is really being separated by the shadow, only by the tonal step,
     #080808 -> #141414 or #FFFFFF -> #F9F6F6. Light holds because that pair differs in hue as well as level; near black
     a display's black floor flattens the other pair, which is the "no shadow on black" problem.
     Enlarging the shadow cannot fix it — `--shadow-xxl` still only reaches #070707, just over
     25px instead of 2 — so the rest draw a LIGHT edge, the only mark that survives on near-black.
     None is gated to dark: each reads a token that inverts with the theme on its own, so the
     light-theme cost stays visible rather than hidden behind a media query. */
  const LIFT = {
    shadow:    { drop: 'var(--shadow-sm)',  paint: null },
    edge:      { drop: 'var(--shadow-sm)',  paint: 'box-shadow:inset 0 1px 0 var(--surface-border)' },
    highlight: { drop: 'var(--shadow-sm)',  paint: 'box-shadow:inset 0 1px 0 color-mix(in srgb, var(--surface-fg) 16%, transparent)' },
    glow:      { drop: 'var(--shadow-sm)',  paint: 'background:linear-gradient(to bottom, color-mix(in srgb, var(--surface-fg) 9%, transparent) 0, transparent var(--spacing-2xl))' },
    ambient:   { drop: 'var(--shadow-xxl)', paint: null },
  };
  const step = LIFT[lift] || LIFT.shadow;
  const surface = sx(
    'position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;' +
    'background:var(--surface-bg);overflow:hidden;box-shadow:' + step.drop + ';' +
    'border-radius:' + r(squareLeft) + ' ' + r(squareRight) + ' 0 0'
  );
  /* Drawn as an overlay rather than an inset shadow on the surface itself: the subheader is an
     opaque `--surface-bg` child sitting exactly on the top edge, and it would paint over an inset
     shadow belonging to its parent. `border-radius:inherit` makes the edge follow the layer's own
     corners, including a squared one where a panel abuts — so it reads as the layer's edge rather
     than as a rule laid across it. */
  const edge = step.paint
    ? <span aria-hidden="true" style={sx('position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:inherit;' + step.paint)} />
    : null;
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
    ? (ScrollArea
        ? <ScrollArea scrollRef={scroller} onScroll={track}>{children}</ScrollArea>
        : <div ref={scroller} onScroll={track} style={sx('flex:1;min-width:0;min-height:0;overflow-y:auto')}>{children}</div>)
    : children;
  if (!scroll) return <div ref={root} onScrollCapture={track} style={surface}>{head}{body}{edge}</div>;
  return <div ref={root} style={surface}>{head}{body}{edge}</div>;
}

import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** The backdrop's front layer: the 1dp --surface-bg surface holding primary content, with a fixed subheader above it and permanently rounded top corners. Owns the scrolling and the per-view scroll memory. */
export function FrontLayer({ children, subheader, scroll = true, scrollKey, onProgress, threshold = 24, squareLeft = false, squareRight = false, platform = 'desktop' }) {
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
  const surface = sx(
    'position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;' +
    'background:var(--surface-bg);overflow:hidden;box-shadow:var(--shadow-sm);' +
    'border-radius:' + r(squareLeft) + ' ' + r(squareRight) + ' 0 0'
  );
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
  if (!scroll) return <div ref={root} onScrollCapture={track} style={surface}>{head}{body}</div>;
  return <div ref={root} style={surface}>{head}{body}</div>;
}

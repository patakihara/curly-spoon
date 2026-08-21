import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
import { ScrollArea } from './ScrollArea.jsx';

/** The page surface: --surface-bg on top of the app bar's bg-alt, top corners rounded. On scroll the corners flatten, a hairline + shadow fade in under the bar, and an Android-style overlay scrollbar appears. */
export function ContentPane({ children, squareRight = false, squareLeft = false, flat = false, square = false, scroll = true, threshold = 24, scrollKey, onProgress }) {
  const [p, setP] = React.useState(0);
  const scroller = React.useRef(null);
  const root = React.useRef(null);
  const saved = React.useRef({});
  const lastKey = React.useRef(scrollKey);
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
  const r = (sq) => 'calc(var(--radius-lg) * ' + (sq || flat || square ? 0 : 1 - p) + ')';
  const surface = sx(
    'position:relative;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--surface-bg);overflow:hidden;' +
    'border-radius:' + r(squareLeft) + ' ' + r(squareRight) + ' 0 0;' +
    'transition:border-radius var(--duration-instant) linear'
  );
  // A hairline that fades in as the content passes under the bar, in place of a drop shadow.
  // A flat pane owns the whole surface, so its divider is permanent rather than scroll-linked.
  const divider = (
    <span aria-hidden="true" style={sx('position:absolute;left:0;right:0;top:0;height:1px;z-index:1;pointer-events:none;background:var(--surface-border);opacity:' + (flat ? '1' : p.toFixed(2)) + ';transition:opacity var(--duration-instant) linear')} />
  );
  if (!scroll) return <div ref={root} onScrollCapture={track} style={surface}>{divider}{children}</div>;
  return <div ref={root} style={surface}>{divider}<ScrollArea scrollRef={scroller} onScroll={track}>{children}</ScrollArea></div>;
}

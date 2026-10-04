import React from 'react';
import { scrollEdges, scrollMax, sx, tokenMs } from '../shared.js';

/**
 * Scroll container with an Android-style overlay scrollbar: the thumb appears while scrolling and fades out shortly after it stops.
 * Native scrollbars are suppressed. It scrolls one axis only: the other is hidden, so nothing inside can make it scroll sideways (or
 * up and down), and the thumb is drawn inside its clipped frame, so the thumb never widens what holds it.
 */
export function ScrollArea({ children, id, onScroll, style, scrollRef, axis = 'y', thumb: showThumb = true, edgeFade = false }) {
  const x = axis === 'x';
  const ref = React.useRef(null);
  const attach = (el) => { ref.current = el; if (typeof scrollRef === 'function') scrollRef(el); else if (scrollRef) scrollRef.current = el; };
  const timer = React.useRef(null);
  const [thumb, setThumb] = React.useState({ size: 0, client: 0, at: 0, visible: false });
  // Whether content runs past each edge, so the fade marks hidden content rather than sitting there.
  const [edges, setEdges] = React.useState({ start: false, end: false });
  // Measuring never reveals the thumb: it also runs on mount and on content changes, and an overlay
  // scrollbar that is visible at rest never fades. Only scrolling reveals it.
  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const client = x ? el.clientWidth : el.clientHeight;
    const pos = x ? el.scrollLeft : el.scrollTop;
    const max = scrollMax(el, x ? 'x' : 'y');
    setEdges(scrollEdges(el, x ? 'x' : 'y'));
    if (max <= 1) { setThumb((t) => ({ ...t, size: 0, visible: false })); return; }
    setThumb((t) => ({ size: (client / (client + max)) * client, client, at: pos / max, visible: t.visible }));
  }, [x]);
  const handle = (e) => {
    measure();
    if (showThumb) {
      setThumb((t) => (t.visible || t.size === 0 ? t : { ...t, visible: true }));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setThumb((t) => ({ ...t, visible: false })), tokenMs(e.currentTarget, '--duration-linger'));
    }
    if (onScroll) onScroll(e);
  };
  React.useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  React.useEffect(() => { measure(); }, [children, measure]);
  const fadeAt = (on) => (on ? 'var(--scroll-edge-fade)' : '0px');
  const mask = edgeFade && (edges.start || edges.end)
    ? 'linear-gradient(to ' + (x ? 'right' : 'bottom') + ', transparent 0px, #000 ' + fadeAt(edges.start) + ', #000 calc(100% - ' + fadeAt(edges.end) + '), transparent 100%)'
    : undefined;
  // The thumb's length is the visible share of the content, never shorter than the minimum; it
  // travels the frame less its own length.
  const length = 'max(var(--scrollbar-thumb-min), ' + thumb.size.toFixed(1) + 'px)';
  const travel = 'calc((' + thumb.client.toFixed(1) + 'px - ' + length + ') * ' + thumb.at.toFixed(4) + ')';
  const scroller = sx(
    'flex:1;min-width:0;min-height:0;scrollbar-width:none;' +
    (x ? 'overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain' : 'overflow-y:auto;overflow-x:hidden')
  );
  return (
    <div style={sx('position:relative;flex:1;min-width:0;min-height:0;display:flex;overflow:hidden')}>
      <div ref={attach} id={id} onScroll={handle} style={Object.assign(scroller, style || {}, mask ? { maskImage: mask, WebkitMaskImage: mask } : {})}>{children}</div>
      {showThumb && (
        <span aria-hidden="true" style={sx(
          'position:absolute;pointer-events:none;border-radius:var(--radius-pill);background:var(--surface-fg-muted);' +
          (x
            ? 'left:0;bottom:var(--scrollbar-inset);height:var(--scrollbar-width);width:' + length + ';transform:translateX(' + travel + ');'
            : 'top:0;right:var(--scrollbar-inset);width:var(--scrollbar-width);height:' + length + ';transform:translateY(' + travel + ');') +
          'opacity:' + (thumb.visible ? 'var(--opacity-scrollbar)' : '0') + ';' +
          'transition:opacity ' + (thumb.visible ? 'var(--duration-fast)' : 'var(--duration-slow)') + ' var(--ease-linear)'
        )} />
      )}
    </div>
  );
}

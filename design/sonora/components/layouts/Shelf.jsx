import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

const arrow = (side, shown, enabled, inset) => sx(
  // 38% rather than 50%: the cards' art is square with a caption beneath, so mid-art sits above mid-card.
  // Sits half a page margin outside the content edge, so it straddles the gutter.
  'position:absolute;top:38%;' + side + ':' + inset + ';transform:translateY(-50%);z-index:2;' +
  'width:40px;height:40px;border-radius:50%;border:none;cursor:pointer;' +
  'display:inline-flex;align-items:center;justify-content:center;' +
  "font-family:'Material Symbols Rounded';font-size:var(--icon-sm);" +
  'background:var(--surface-card);color:var(--surface-fg);' +
  'box-shadow:var(--shadow-md);' +
  'opacity:' + (shown && enabled ? '0.72' : '0') + ';' +
  'pointer-events:' + (shown && enabled ? 'auto' : 'none') + ';' +
  'transition:opacity var(--duration-fast) ease'
);

/**
 * Horizontally scrolling row that bleeds past the page margin, so cards run off the edge instead
 * of clipping at the gutter. Desktop gets arrows that fade in on hover/focus and page by two
 * items; mobile gets a fading overlay thumb.
 */
export function Shelf({ children, gap, margin, platform = 'desktop', step = 2, arrows, scrollbar }) {
  const mobile = platform === 'mobile';
  const StateLayer = NS().StateLayer;
  const g = gap || 'var(--grid-gutter' + (mobile ? '-mobile' : '') + ')';
  const m = margin || 'var(--grid-margin' + (mobile ? '-mobile' : '') + ')';
  const showArrows = arrows === undefined ? !mobile : arrows;
  const showBar = scrollbar === undefined ? mobile : scrollbar;
  const ref = React.useRef(null);
  const timer = React.useRef(null);
  const [hot, setHot] = React.useState(false);
  const [ends, setEnds] = React.useState({ start: true, end: false });
  const [thumb, setThumb] = React.useState({ size: 0, offset: 0, visible: false });
  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEnds({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
    if (max <= 1) { setThumb((t) => ({ ...t, visible: false })); return; }
    const size = Math.max(32, (el.clientWidth / el.scrollWidth) * el.clientWidth);
    // Measuring must not reveal the thumb: it also runs on mount and on content changes, and an
    // overlay scrollbar that is visible at rest never fades.
    setThumb((t) => ({ size, offset: (el.scrollLeft / max) * (el.clientWidth - size), visible: t.visible }));
  }, []);
  React.useEffect(() => { measure(); }, [measure, children]);
  React.useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  const onScroll = () => {
    measure();
    if (!showBar) return;
    setThumb((t) => (t.visible ? t : { ...t, visible: true }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setThumb((t) => ({ ...t, visible: false })), 900);
  };
  // Pages by whole items: measures the first child plus the gap rather than guessing a pixel amount.
  const page = (dir) => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild;
    const w = first ? first.getBoundingClientRect().width : el.clientWidth / 3;
    const gapPx = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
    el.scrollBy({ left: dir * step * (w + gapPx), behavior: 'smooth' });
  };
  return (
    <div style={sx('position:relative')}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      onFocusCapture={() => setHot(true)} onBlurCapture={() => setHot(false)}>
      {/* 5px more inside the scroller above and below, taken back by the margin, so a focused
          card's ring (3px wide, 2px out) is not clipped. */}
      <div ref={ref} onScroll={onScroll} style={sx('display:flex;gap:' + g + ';overflow-x:auto;margin:-5px calc(-1 * ' + m + ');padding:5px ' + m + ' calc(var(--spacing-xs) + 5px);scrollbar-width:none')}>{children}</div>
      {showArrows && (
        <React.Fragment>
          <button className="sn-int" aria-label="Scroll back" disabled={ends.start} onClick={() => page(-1)} style={arrow('left', hot, !ends.start, 'calc(-1 * ' + m + ' / 2)')}>chevron_left{StateLayer && <StateLayer />}</button>
          <button className="sn-int" aria-label="Scroll forward" disabled={ends.end} onClick={() => page(1)} style={arrow('right', hot, !ends.end, 'calc(-1 * ' + m + ' / 2)')}>chevron_right{StateLayer && <StateLayer />}</button>
        </React.Fragment>
      )}
      {showBar && (
        <span aria-hidden="true" style={sx(
          'position:absolute;left:0;bottom:0;height:3px;border-radius:var(--radius-pill);pointer-events:none;' +
          'width:' + thumb.size.toFixed(1) + 'px;transform:translateX(' + thumb.offset.toFixed(1) + 'px);' +
          'background:var(--surface-fg-muted);opacity:' + (thumb.visible ? '0.55' : '0') + ';' +
          'transition:opacity ' + (thumb.visible ? '120ms' : '500ms') + ' linear'
        )} />
      )}
    </div>
  );
}

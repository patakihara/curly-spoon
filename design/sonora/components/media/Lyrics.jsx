import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

// Nearest scrolling ancestor, so a synced list can follow the song inside whatever pane holds it.
const scrollerOf = (el) => {
  for (let p = el && el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
};

/**
 * The lyric list, in the three states the sync control cycles through:
 * `sync` — the line being sung takes accent ink a step larger, lines already sung stay at full
 *          strength and lines still to come sit muted;
 * `dot`  — every line reads at full strength, the current one marked by an accent dot that slides
 *          between lines;
 * `off`  — no sync, no indication: a plain lyric sheet.
 * The dot's gutter is held in every mode, so switching modes never moves the text.
 * Only `sync` follows the song by scrolling.
 */
export function Lyrics({
  lines = [], activeIndex = 0, platform = 'desktop', syncMode = 'sync',
  card = true, textSize, autoScroll = true, onLineClick,
}) {
  const mobile = platform === 'mobile';
  const synced = syncMode === 'sync';
  const dotted = syncMode === 'dot';
  const ref = React.useRef(null);
  const linesRef = React.useRef(null);
  React.useEffect(() => {
    if (!synced || !autoScroll) return;
    const el = linesRef.current, row = el && el.children[activeIndex], sc = scrollerOf(ref.current);
    if (!row || !sc) return;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delta = (row.getBoundingClientRect().top - sc.getBoundingClientRect().top) - sc.clientHeight * 0.32;
    sc.scrollTo({ top: sc.scrollTop + delta, behavior: reduced ? 'auto' : 'smooth' });
  }, [activeIndex, synced, autoScroll]);

  // One dot for the whole sheet, moved to the current line rather than redrawn on it.
  const [dotY, setDotY] = React.useState(null);
  React.useLayoutEffect(() => {
    const el = linesRef.current, row = el && el.children[activeIndex];
    if (!row) return;
    // Centre on the row's FIRST line, not the whole block: a lyric that wraps to three lines still
    // gets its dot beside the line the eye starts on.
    const lh = parseFloat(getComputedStyle(row).lineHeight) || row.offsetHeight;
    setDotY(row.offsetTop + lh / 2 - 4);
  }, [activeIndex, lines.length, textSize, mobile, dotted]);

  const size = textSize || 'var(--text-lg)';
  const ink = (i) => synced
    ? (i === activeIndex ? 'var(--accent-ink)' : i > activeIndex ? 'var(--surface-fg-muted)' : 'var(--surface-fg)')
    : 'var(--surface-fg)';
  return (
    <div ref={ref} style={sx('position:relative;box-sizing:border-box;padding:var(--spacing-sm) calc(var(--spacing-2xl) + var(--spacing-sm))' +
      (card ? ';background:var(--surface-card);border-radius:var(--radius-sm)' : ''))}>
      {dotted && dotY !== null && (
        <span aria-hidden="true" style={sx('position:absolute;left:calc((var(--spacing-2xl) + var(--spacing-sm) - 8px) / 2);top:0;width:8px;height:8px;border-radius:var(--radius-pill);background:var(--accent-ink);' +
          'transform:translateY(' + dotY + 'px);transition:transform var(--duration-medium) var(--ease-standard),opacity var(--duration-quick) linear')} />
      )}
      <div ref={linesRef} data-sn-lyric-lines="" style={sx('display:flex;flex-direction:column;gap:' + (mobile ? '22px' : '16px'))}>
        {lines.map((text, i) => (
          <div key={i} onClick={onLineClick ? () => onLineClick(i) : undefined}
            style={sx('line-height:1.5;text-wrap:pretty;transition:color var(--duration-quick) var(--ease-standard);font-size:' +
              (synced && i === activeIndex ? 'calc(' + size + ' * 1.12)' : size) + ';font-weight:' +
              (synced && i === activeIndex ? '700' : '500') + ';color:' + ink(i) + (onLineClick ? ';cursor:pointer' : ''))}>{text}</div>
        ))}
      </div>
    </div>
  );
}

import React from 'react';
import { NS, activate, nearestScroller, sx } from '../shared.js';

/**
 * The lyric list, in the three states the sync control cycles through:
 * `sync` — the line being sung takes play ink a step larger, lines already sung stay at full
 *          strength and lines still to come sit muted;
 * `dot`  — every line reads at full strength, the current one marked by a play-ink dot that slides
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
  const StateLayer = NS().StateLayer;
  const synced = syncMode === 'sync';
  const dotted = syncMode === 'dot';
  const ref = React.useRef(null);
  const linesRef = React.useRef(null);
  React.useEffect(() => {
    if (!synced || !autoScroll) return;
    const el = linesRef.current, row = el && el.children[activeIndex], sc = nearestScroller(ref.current);
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
    ? (i === activeIndex ? 'var(--play-ink)' : i > activeIndex ? 'var(--surface-fg-muted)' : 'var(--surface-fg)')
    : 'var(--surface-fg)';
  return (
    <div ref={ref} style={sx('position:relative;box-sizing:border-box;padding:var(--spacing-sm) calc(var(--spacing-2xl) + var(--spacing-sm))' +
      (card ? ';background:var(--surface-card);border-radius:var(--radius-sm)' : ''))}>
      {dotted && dotY !== null && (
        <span aria-hidden="true" style={sx('position:absolute;left:calc((var(--spacing-2xl) + var(--spacing-sm) - 8px) / 2);top:0;width:8px;height:8px;border-radius:var(--radius-pill);background:var(--play-ink);' +
          'transform:translateY(' + dotY + 'px);transition:transform var(--duration-medium) var(--ease-standard),opacity var(--duration-quick) linear')} />
      )}
      <div ref={linesRef} data-sn-lyric-lines="" style={sx('display:flex;flex-direction:column;gap:' + (mobile ? '22px' : '16px'))}>
        {lines.map((text, i) => {
          const css = 'line-height:1.5;text-wrap:pretty;transition:color var(--duration-quick) var(--ease-standard);font-size:' +
            (synced && i === activeIndex ? 'calc(' + size + ' * 1.12)' : size) + ';font-weight:' +
            (synced && i === activeIndex ? '700' : '500') + ';color:' + ink(i);
          // A line is a control only when a press on it seeks; a plain sheet's lines are text.
          if (!onLineClick) return <div key={i} style={sx(css)}>{text}</div>;
          return (
            <div key={i} className="sn-int" role="button" tabIndex={0} onClick={() => onLineClick(i)}
              onKeyDown={activate(() => onLineClick(i))}
              style={sx(css + ';cursor:pointer;border-radius:var(--radius-xs);margin:0 calc(-1 * var(--spacing-sm));padding:0 var(--spacing-sm)')}>
              {text}
              {StateLayer && <StateLayer />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

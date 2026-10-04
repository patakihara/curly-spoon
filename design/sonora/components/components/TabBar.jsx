import React from 'react';
import { NS, sx } from '../shared.js';

/**
 * Icon + label tabs for the app bar's second row: scrolls sideways, active tab keeps an accent
 * underline. `fill` shares the row's width equally among the tabs instead, for a row of a few.
 */
export function TabBar({ items = [], value, onChange, platform = 'desktop', fill = false }) {
  const mobile = platform === 'mobile';
  const StateLayer = NS().StateLayer;
  const off = !onChange;
  const opts = items.map((it) => (typeof it === 'string' ? { key: it, label: it } : it));
  const ref = React.useRef(null);
  // A tab that lands off-screen scrolls itself into the row, keeping a gutter so it never sits flush
  // against the edge and reads as cut off. The row is placed again once the icon font has loaded:
  // measured before it, each glyph is its ligature's full name, the tabs are far wider than they
  // will be, and a tab that fits would otherwise stay scrolled half out of the row.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const place = (from, smooth) => {
      let i = -1;
      for (let n = 0; n < opts.length; n++) if (opts[n].key === value) i = n;
      const btn = i > -1 && el.children[i];
      if (!btn) return;
      const b = btn.getBoundingClientRect(), c = el.getBoundingClientRect(), pad = 24;
      // The tab's place along the whole row, then the least scroll from `from` that shows it.
      const start = b.left - c.left + el.scrollLeft, end = start + b.width;
      let left = from;
      if (end - left > c.width - pad) left = end - c.width + pad;
      if (start - left < pad) left = Math.max(0, start - pad);
      if (left === el.scrollLeft) return;
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    };
    place(el.scrollLeft, true);
    let live = true;
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (live) place(0, false); });
    }
    return () => { live = false; };
  }, [value]); // eslint-disable-line
  return (
    // The row scrolls, and a scroller clips: 5px of padding inside it, taken back by the margin,
    // leave room for a focused tab's ring (3px wide, 2px out) without moving a tab.
    <div ref={ref} role="tablist" style={sx('display:flex;gap:var(--spacing-xs);margin:-5px;padding:5px;max-width:calc(100% + 10px);overflow-x:auto;scrollbar-width:none')}>
      {opts.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key} className="sn-int" role="tab" aria-selected={on} disabled={off} onClick={off ? undefined : () => onChange(o.key)}
            style={sx((fill ? 'flex:1 1 0;min-width:0;' : 'flex:0 0 auto;') + 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;border:none;border-radius:var(--radius-xs) var(--radius-xs) 0 0;background:transparent;cursor:pointer;' +
              'font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--weight-strong);' +
              'color:' + (on ? 'var(--accent-ink)' : 'var(--surface-fg-muted)') + ';transition:color var(--duration-quick) ease-in-out')}>
            <span style={sx('display:flex;align-items:center;gap:var(--spacing-sm);white-space:nowrap;height:' + (mobile ? '30px' : '32px') + ';padding:0 ' + (fill ? 'var(--spacing-xs)' : 'var(--spacing-md)'))}>
              {o.icon && <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;font-variation-settings:'FILL' " + (on ? 1 : 0) + ",'wght' " + (on ? 500 : 400))}>{o.icon}</span>}
              {o.label}
            </span>
            {/* Indicator is always in flow, so switching tabs never shifts the row's height. */}
            <span aria-hidden="true" style={sx('width:100%;height:3px;border-radius:var(--radius-pill);background:' + (on ? 'var(--accent-ink)' : 'transparent') + ';transition:background var(--duration-quick) ease-in-out')} />
            {StateLayer && <StateLayer disabled={off} />}
          </button>
        );
      })}
    </div>
  );
}

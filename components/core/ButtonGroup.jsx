import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** M3 connected button group: one filter/mode row, outer ends pill, 8px inner corners, selected segment morphs to fully rounded. */
export function ButtonGroup({ items = [], value, onChange, platform = 'desktop', scroll = false, leading }) {
  const mobile = platform === 'mobile';
  const opts = items.map((it) => (typeof it === 'string' ? { key: it, label: it } : it));
  const h = mobile ? 36 : 32, half = h / 2, r = 8;
  // Momentum plus a trailing-edge fade so a row that keeps going off-screen reads as scrollable
  // rather than clipped. Content is left-flush and starts at scrollLeft 0, so only the right edge
  // ever has something to hide — fading the left edge too would half-erase the first (often
  // selected) chip before any scrolling has happened.
  const scrollCss = scroll
    ? ';-webkit-overflow-scrolling:touch;mask-image:linear-gradient(to right,black,black calc(100% - var(--spacing-2xl)),transparent);-webkit-mask-image:linear-gradient(to right,black,black calc(100% - var(--spacing-2xl)),transparent)'
    : '';
  const track = (
    <div style={sx('display:flex;gap:2px;flex-wrap:nowrap;max-width:100%;overflow-x:auto' + scrollCss + (leading ? ';flex:1;min-width:0' : ''))}>
      {opts.map((o, i) => {
        const on = value === o.key, first = i === 0, last = i === opts.length - 1;
        const l = on || first ? half : r, right = on || last ? half : r;
        const iconOnly = !!o.icon && !o.label;
        return (
          <div key={o.key} onClick={() => onChange && onChange(o.key)} role="button" aria-pressed={on} aria-label={o.ariaLabel || o.label || o.key} title={iconOnly ? (o.ariaLabel || o.label || o.key) : undefined}
            style={sx('display:flex;align-items:center;justify-content:center;gap:var(--spacing-sm);flex-shrink:0;white-space:nowrap;cursor:pointer;user-select:none;' +
              'height:' + h + 'px;' + (iconOnly ? 'width:' + (mobile ? 52 : 48) + 'px;padding:0;' : 'padding:0 var(--spacing-lg);') + 'border:none;' +
              'font-family:var(--font-body);font-size:var(--text-sm);font-weight:700;' +
              'background:' + (on ? 'var(--accent-rose)' : 'var(--surface-card)') + ';' +
              'color:' + (on ? 'var(--accent-contrast)' : 'var(--surface-fg)') + ';' +
              'transition:border-radius var(--duration-quick) ease-in-out,background var(--duration-quick) ease-in-out,color var(--duration-quick) ease-in-out;' +
              'border-radius:' + l + 'px ' + right + 'px ' + right + 'px ' + l + 'px')}>
            {o.icon && <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;font-variation-settings:'FILL' " + (on ? 1 : 0) + ",'wght' " + (on ? 500 : 400))}>{o.icon}</span>}
            {o.label}
          </div>
        );
      })}
    </div>
  );
  // `leading` is a pinned slot outside the scroll track — an account avatar that should never
  // scroll out of view with the filters it sits beside.
  if (!leading) return track;
  return (
    <div style={sx('display:flex;align-items:center;gap:var(--spacing-sm);min-width:0')}>
      <div style={sx('flex-shrink:0')}>{leading}</div>
      {track}
    </div>
  );
}

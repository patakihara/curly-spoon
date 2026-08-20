import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** M3 connected button group: one filter/mode row, outer ends pill, 8px inner corners, selected segment morphs to fully rounded. */
export function ButtonGroup({ items = [], value, onChange, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const opts = items.map((it) => (typeof it === 'string' ? { key: it, label: it } : it));
  const h = mobile ? 36 : 32, half = h / 2, r = 8;
  return (
    <div style={sx('display:flex;gap:2px;flex-wrap:nowrap;max-width:100%;overflow-x:auto')}>
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
}

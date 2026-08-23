import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/**
 * Bottom app bar: the row of page-level actions docked to the bottom of a full-screen page — the
 * counterpart to the top app bar. Now Playing uses it to reach lyrics and the queue without
 * scrolling to their previews. Icon-only, labelled by title/aria; an active action takes accent ink.
 */
export function BottomAppBar({
  actions = [], spread = true, align = 'start', background = 'var(--surface-bg-alt)', divider = true, trailing,
}) {
  const justify = spread ? 'space-around' : align === 'end' ? 'flex-end' : 'flex-start';
  return (
    <div role="toolbar" style={sx('display:flex;align-items:center;flex-shrink:0;box-sizing:border-box;width:100%;gap:var(--spacing-xs);' +
      'height:var(--bottom-app-bar-height);padding:0 var(--spacing-md);background:' + background +
      (divider ? ';border-top:1px solid var(--surface-border)' : ''))}>
      <div style={sx('flex:1;min-width:0;display:flex;align-items:center;gap:var(--spacing-sm);justify-content:' + justify)}>
        {actions.map((a, i) => (
          <button key={a.key || a.label || i} onClick={a.onClick} aria-label={a.label} title={a.label} disabled={a.disabled}
            style={sx('display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;flex:0 0 auto;' +
              'width:' + (a.caption ? '56px' : '48px') + ';height:48px;border:none;background:transparent;border-radius:var(--radius-sm);' +
              'font-family:var(--font-body);font-size:var(--text-xs);font-weight:var(--weight-strong);' +
              'cursor:' + (a.disabled ? 'default' : 'pointer') + ';opacity:' + (a.disabled ? '0.4' : '1') + ';' +
              'transition:color var(--duration-fast) var(--ease-standard);' +
              'color:' + (a.active ? 'var(--accent-ink)' : 'var(--surface-fg-muted)'))}>
            <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-sm);line-height:1;font-variation-settings:'FILL' " + (a.active ? 1 : 0) + ",'wght' " + (a.active ? 500 : 400))}>{a.icon}</span>
            {a.caption && <span>{a.caption}</span>}
          </button>
        ))}
      </div>
      {trailing}
    </div>
  );
}

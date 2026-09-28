import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** What a page shows when it has nothing to show: a glyph, the fact in a heading and a line, and the one way on. Centred in its column, no filler copy. */
export function EmptyState({ icon, title, body, action, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  return (
    <div role="status" style={sx('display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--spacing-md);box-sizing:border-box;width:100%;max-width:var(--grid-max-width-form);margin:0 auto;padding:var(--spacing-2xl) var(--spacing-lg)')}>
      {icon && (
        <div aria-hidden="true" style={sx('display:flex;align-items:center;justify-content:center;width:calc(var(--icon-md) * 2);height:calc(var(--icon-md) * 2);border-radius:50%;background:var(--surface-card);color:var(--surface-fg-muted)')}>
          <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-md);line-height:1;font-variation-settings:'FILL' 0,'wght' 400")}>{icon}</span>
        </div>
      )}
      <div style={sx('font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:var(--' + (mobile ? 'text-2xl' : 'h4-size') + ');line-height:1.2;color:var(--surface-fg)')}>{title}</div>
      {body && <div style={sx('font-family:var(--font-body);font-size:var(--text-md);line-height:1.5;color:var(--surface-fg-muted)')}>{body}</div>}
      {action && <div style={sx('display:flex;justify-content:center;margin-top:var(--spacing-sm)')}>{action}</div>}
    </div>
  );
}

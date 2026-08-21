import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** The backdrop's back layer: the 0dp --surface-bg-alt surface carrying the page heading and any contextual controls that reconfigure what the front layer is showing. No rounding, no elevation. */
export function BackLayer({ title, leading, trailing, controls, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const pad = 'var(--spacing-' + (mobile ? 'md' : 'xl') + ')';
  return (
    <div style={sx('display:flex;flex-direction:column;flex-shrink:0;box-sizing:border-box;width:100%;background:var(--surface-bg-alt)')}>
      {/* The heading strip keeps the app bar's height so a side panel's own title row, which is
          measured against the same token, still lines up with it. */}
      <div style={sx('display:flex;align-items:center;gap:var(--spacing-md);width:100%;box-sizing:border-box;padding:0 ' + pad + ';height:var(--appbar-height' + (mobile ? '-mobile' : '') + ')')}>
        {leading}
        <div style={sx('flex:1;min-width:0;font-family:var(--font-display);font-weight:400;letter-spacing:-.01em;font-size:var(--' + (mobile ? 'h3' : 'h2') + '-size);line-height:1.1;color:var(--surface-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{title}</div>
        {trailing && <div style={sx('display:flex;align-items:center;flex-shrink:0')}>{trailing}</div>}
      </div>
      {/* Controls that stay put while the front layer's content changes underneath them. Anything
          that names a section of the content, or scrolls away with it, belongs on the front
          layer's subheader instead. */}
      {controls && (
        <div style={sx('display:flex;align-items:center;width:100%;box-sizing:border-box;min-height:var(--appbar-controls-height);padding:0 ' + pad + ';padding-bottom:var(--spacing-md)')}>
          <div style={sx('flex:1;min-width:0;max-width:100%')}>{controls}</div>
        </div>
      )}
    </div>
  );
}

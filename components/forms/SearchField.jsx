import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** Filled search field: no outline, softly rectangular (not a pill). Sits in the TopAppBar on library pages. */
export function SearchField({ placeholder, value, onChange, platform = 'desktop', width = '100%', height, onSubmit, autoFocus = false, onClose, closeGlyph = 'close' }) {
  const mobile = platform === 'mobile';
  const ref = React.useRef(null);
  // Focus on open, not on mount: the field is often revealed by a morph rather than remounted,
  // and the focus has to wait a frame for the reveal to give it a box.
  React.useEffect(() => {
    if (!autoFocus) return;
    const id = requestAnimationFrame(() => { if (ref.current) ref.current.focus(); });
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);
  return (
    <div style={sx('display:flex;align-items:center;gap:var(--spacing-md);width:' + width + ';height:' + (height || (mobile ? '40px' : '44px')) + ';padding:0 var(--spacing-lg);box-sizing:border-box;border:none;border-radius:var(--radius-xs);background:var(--surface-card)')}>
      <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;flex-shrink:0;color:var(--surface-fg-muted)")}>search</span>
      <input ref={ref} value={value} placeholder={placeholder} onChange={(e) => onChange && onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) onSubmit(e.target.value); }}
        style={sx('flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:var(--font-body);font-weight:var(--weight-body);font-size:var(--text-md);color:var(--surface-fg)')} />
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close search" title="Close search"
          style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:50%;cursor:pointer;background:transparent;color:var(--surface-fg-muted);transition:color var(--duration-fast) ease")}>{closeGlyph}</button>
      )}
    </div>
  );
}

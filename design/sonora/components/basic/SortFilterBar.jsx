import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** States the active sort/filter and opens its picker in one control — the label is data ("All episodes • Newest"), not a fixed name. */
export function SortFilterBar({ icon = 'tune', label, onClick, trailing, platform = 'desktop' }) {
  const StateLayer = NS().StateLayer;
  const off = !onClick;
  const mobile = platform === 'mobile';
  return (
    <div style={sx('display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);width:100%;background:transparent')}>
      <button className="sn-int" onClick={off ? undefined : onClick} disabled={off} style={sx('display:flex;align-items:center;gap:var(--spacing-sm);min-width:0;border:none;background:transparent;cursor:pointer;padding:' + (mobile ? '8px 4px' : '6px 4px'))}>
        <span style={sx("flex-shrink:0;font-family:'Material Symbols Rounded';font-size:var(--icon-sm);line-height:1;color:var(--surface-fg-muted);font-variation-settings:'FILL' 0,'wght' 400")}>{icon}</span>
        <span style={sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-body);font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{label}</span>
        {StateLayer && <StateLayer disabled={off} />}
      </button>
      {trailing && <div style={sx('flex-shrink:0')}>{trailing}</div>}
    </div>
  );
}

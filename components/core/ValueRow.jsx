import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** Label + value on a filled card — playback speed, sleep timer, any read-only setting readout. */
export function ValueRow({ label, value, platform = 'desktop', onClick }) {
  const mobile = platform === 'mobile';
  return (
    <div onClick={onClick} style={sx('display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-lg);box-sizing:border-box;width:100%;padding:' + (mobile ? '14px 16px' : '12px 14px') + ';border-radius:var(--radius-' + (mobile ? 'sm' : 'xs') + ');background:var(--surface-card)' + (onClick ? ';cursor:pointer' : ''))}>
      <span style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{label}</span>
      <span style={sx('font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{value}</span>
    </div>
  );
}

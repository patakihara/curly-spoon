import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** Labelled form field. Supplies the filled container the chromeless mobile Input expects. */
export function FieldRow({ label, placeholder, value, platform = 'desktop', onChange }) {
  const Input = NS().Input;
  const mobile = platform === 'mobile';
  return (
    <div style={sx('display:flex;flex-direction:column;gap:var(--spacing-sm)')}>
      <div style={sx('font-size:var(--text-sm);font-weight:var(--weight-strong);color:var(--surface-fg-muted)')}>{label}</div>
      <div style={mobile ? sx('background:var(--surface-card);border-radius:var(--radius-pill);padding:var(--spacing-xs) var(--spacing-sm)') : undefined}>
        {Input && <Input placeholder={placeholder} value={value} platform={platform} onChange={onChange} />}
      </div>
    </div>
  );
}

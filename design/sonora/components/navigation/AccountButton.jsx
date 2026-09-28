import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** The account avatar that leads the phone's top bar, the way into Settings. A round button holding the account's picture, or a person glyph on the card tone without one. Never in a filter row. */
export function AccountButton({ image, label = 'Account', size = 32, onClick }) {
  const { CoverArt } = NS();
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
      style={sx('position:relative;overflow:hidden;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;cursor:pointer;background:var(--surface-card);color:var(--surface-fg-muted);width:' + size + 'px;height:' + size + 'px')}>
      {image && CoverArt
        ? <CoverArt src={image} alt="" />
        : <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';line-height:1;font-variation-settings:'FILL' 1;font-size:" + Math.round(size * 0.7) + 'px')}>person</span>}
    </button>
  );
}

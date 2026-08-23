import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** Circular artist/author/narrator card for a people shelf. */
export function ArtistCard({ title, sub, platform = 'desktop', image, width, onClick }) {
  const CoverArt = NS().CoverArt;
  const mobile = platform === 'mobile';
  const w = width || (mobile ? '132px' : '160px');
  return (
    <div onClick={onClick} style={sx('display:flex;flex-direction:column;align-items:center;text-align:center;cursor:pointer;min-width:0;width:' + w + (w === '100%' ? '' : ';flex-shrink:0'))}>
      <div style={sx('position:relative;width:100%;aspect-ratio:1;border-radius:50%;overflow:hidden')}>{CoverArt && <CoverArt src={image} />}</div>
      <div style={sx('margin-top:12px;width:100%;font-size:var(--text-md);font-weight:var(--weight-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--surface-fg)')}>{title}</div>
      <div style={sx('margin-top:2px;width:100%;font-size:var(--text-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--surface-fg-muted)')}>{sub}</div>
    </div>
  );
}

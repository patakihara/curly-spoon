import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

if (typeof document !== 'undefined' && !document.getElementById('sonora-browsecard-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-browsecard-css';
  // Overflow stays visible on the card itself so the tilted thumbnail can spill past the corner —
  // that's what makes it read as a stack of content rather than a flat label.
  el.textContent = '.sn-browsecard{transition:transform var(--duration-quick) var(--ease-standard)}'
    + '.sn-browsecard:hover,.sn-browsecard:focus-visible{transform:translateY(-2px)}'
    + '@media (prefers-reduced-motion:reduce){.sn-browsecard{transition:none}}';
  document.head.appendChild(el);
}

const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];

/** Enters a category whose content you can't name yet — distinct from Chip, which filters an existing result set rather than navigating into one. */
export function BrowseCard({ title, color, image, onClick, platform = 'desktop' }) {
  const CoverArt = NS().CoverArt;
  // No two adjacent categories without an explicit color should land on the same hue by coincidence
  // more than chance allows, so the fallback is derived from the title rather than fixed.
  const seed = String(title || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const hue = color || HUES[seed % HUES.length];
  return (
    <div className="sn-browsecard" onClick={onClick} role="button" tabIndex={0} aria-label={title}
      style={sx('position:relative;aspect-ratio:2.6;overflow:visible;border-radius:var(--radius-sm);cursor:pointer;background:var(--accent-' + hue + ')')}>
      <div style={sx('position:absolute;left:var(--spacing-md);top:var(--spacing-md);right:calc(38% + var(--spacing-md));font-family:var(--font-heading);font-size:var(--text-2xl);font-weight:900;line-height:1.1;color:var(--accent-contrast)')}>{title}</div>
      {image && CoverArt && (
        <div style={sx('position:absolute;right:6%;bottom:-14%;height:38%;aspect-ratio:1;transform:rotate(25deg);border-radius:var(--radius-xs);overflow:hidden;box-shadow:var(--shadow-md)')}>
          <CoverArt src={image} />
        </div>
      )}
    </div>
  );
}

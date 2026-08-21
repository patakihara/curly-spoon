import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/** The front layer's subheader: a fixed band at the same 1dp as the content below it, carrying tabs, a filter group or a scoped search field. Draws a scroll-linked hairline only when its content is not a tab bar. */
export function FrontLayerHeader({ children, tabs = false, progress = 0, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  /* The subheader shares the content's measure, so it takes the page margin rather than the app
     bar's inset — the tabs line up with the section headings underneath them. */
  const pad = 'var(--grid-margin' + (mobile ? '-mobile' : '') + ')';
  // A tab bar already draws an underline indicator; a hairline under it would be a second
  // horizontal rule saying the same thing.
  const show = tabs ? 0 : Math.min(1, Math.max(0, progress || 0));
  return (
    <div style={sx('position:relative;flex-shrink:0;display:flex;align-items:center;box-sizing:border-box;width:100%;background:var(--surface-bg);min-height:var(--appbar-controls-height);padding:0 ' + pad)}>
      <div style={sx('flex:1;min-width:0;max-width:100%')}>{children}</div>
      {/* Inset to the content measure, not full-bleed: a rule that runs gutter to gutter cuts the
          front layer in half instead of reading as the top of the content column. */}
      {!tabs && (
        <span aria-hidden="true" style={sx(
          'position:absolute;bottom:0;height:1px;z-index:1;pointer-events:none;background:var(--surface-border);' +
          'left:' + pad + ';right:' + pad + ';' +
          'opacity:' + show.toFixed(2) + ';transition:opacity var(--duration-instant) linear'
        )} />
      )}
    </div>
  );
}

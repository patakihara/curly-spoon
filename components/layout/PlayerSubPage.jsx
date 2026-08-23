import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * The shell every page opened *from* the player shares (lyrics, queue): an app bar carrying the page
 * name alone, then a scrolling body whose first row pairs what the page is about with its controls.
 * The bar's close button collapses the page back into whatever expanded it. Inside the desktop player
 * panel set `scroll={false}` and `heading={null}`: the panel owns both.
 */
export function PlayerSubPage({
  platform = 'mobile', heading, meta, controls, footer, scroll = true, onClose, closeGlyph = 'close', children,
}) {
  const { ScrollArea, IconButton } = NS();
  const mobile = platform === 'mobile';
  const pad = mobile ? 'var(--spacing-lg)' : 'var(--spacing-md)';
  const Scroller = scroll
    ? (ScrollArea || (({ children: kids, style }) => <div style={Object.assign({ flex: 1, minHeight: 0, overflowY: 'auto' }, style)}>{kids}</div>))
    : (({ children: kids }) => <div>{kids}</div>);
  const inner = (
    <div style={sx('display:flex;flex-direction:column;gap:' + (mobile ? 'var(--spacing-lg)' : 'var(--spacing-md)'))}>
      {(meta || controls) && (
        <div style={sx('display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-sm)')}>
          <div style={sx('min-width:0;font-size:var(--text-lg);color:var(--surface-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{meta}</div>
          {controls}
        </div>
      )}
      {children}
    </div>
  );
  if (!scroll) return <div style={sx('display:flex;flex-direction:column;gap:var(--spacing-md)')}>{inner}{footer}</div>;
  return (
    <div style={sx('display:flex;flex-direction:column;flex:1;min-height:0;background:var(--surface-bg)')}>
      <div style={sx('display:flex;align-items:center;flex-shrink:0;box-sizing:border-box;height:var(--appbar-height-mobile);padding:0 ' + pad + ';border-bottom:1px solid var(--surface-border)')}>
        {heading && <div style={sx('flex:1;min-width:0;font-family:var(--font-body);font-weight:var(--weight-strong);font-size:var(--text-xl);line-height:1.2;color:var(--surface-fg);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{heading}</div>}
        {onClose && IconButton && (
          <IconButton label={'Close ' + (heading || 'page').toLowerCase()} muted onClick={onClose}>
            <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 'var(--icon-sm)', lineHeight: 1 }}>{closeGlyph}</span>
          </IconButton>
        )}
      </div>
      <Scroller edgeFade style={sx('padding:' + pad + ' ' + pad + ' var(--spacing-2xl)')}>{inner}</Scroller>
      {footer}
    </div>
  );
}

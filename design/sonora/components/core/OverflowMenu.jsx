import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * The three-dot button and the menu it opens: the verbs an item offers that are not worth a button
 * of their own. On desktop the menu drops below the button on a raised card, lined up with the
 * button's end (or start) edge, and lies over what follows rather than pushing it down. On a phone
 * it is a modal bottom sheet over the whole window.
 */
export function OverflowMenu({ items = [], label = 'More options', open, onOpenChange, onSelect, align = 'end', tone = 'surface', platform = 'desktop' }) {
  const IconButton = NS().IconButton;
  const mobile = platform === 'mobile';
  const [own, setOwn] = React.useState(false);
  const shown = open === undefined ? own : open;
  const set = (next) => { if (open === undefined) setOwn(next); if (onOpenChange) onOpenChange(next); };
  const glyph = (name) => React.createElement('span', { 'aria-hidden': 'true', style: sx("font-family:'Material Symbols Rounded';font-size:var(--icon-sm);line-height:1;font-variation-settings:'FILL' 0,'wght' 400") }, name);
  const rows = items.map((item) => (
    <div key={item.key} role="menuitem" tabIndex={0}
      onClick={() => { if (onSelect) onSelect(item.key); set(false); }}
      style={sx('display:flex;align-items:center;gap:var(--spacing-' + (mobile ? 'lg' : 'md') + ');padding:var(--spacing-sm) var(--spacing-' + (mobile ? 'xl' : 'lg') + ');min-height:' + (mobile ? '56px' : '44px') + ';box-sizing:border-box;cursor:pointer;color:var(--surface-fg);font-family:var(--font-body)')}>
      {item.icon && <span style={sx('display:flex;color:var(--surface-fg-muted)')}>{glyph(item.icon)}</span>}
      <div style={sx('display:flex;flex-direction:column;gap:2px;min-width:0')}>
        <div style={sx('font-size:var(--text-md);font-weight:var(--weight-medium);line-height:1.3')}>{item.label}</div>
        {item.sub && <div style={sx('font-size:var(--text-sm);line-height:1.3;color:var(--surface-fg-muted)')}>{item.sub}</div>}
      </div>
    </div>
  ));
  /* On a phone the verbs are a modal bottom sheet, not a menu: fixed to the window, so it covers
     the bottom bar and the mini-player too, over a scrim that closes it when tapped. */
  const sheet = shown && (
    <React.Fragment>
      <div aria-hidden="true" onClick={() => set(false)}
        style={sx('position:fixed;inset:0;z-index:40;background:var(--scrim)')} />
      <div role="menu" aria-label={label} aria-modal="true"
        style={sx('position:fixed;left:0;right:0;bottom:0;z-index:41;max-height:80%;overflow-y:auto;box-sizing:border-box;padding:0 0 var(--spacing-lg);border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:var(--surface-card);box-shadow:var(--shadow-lg);text-align:left')}>
        <div aria-hidden="true" style={sx('width:32px;height:4px;margin:var(--spacing-lg) auto var(--spacing-sm);border-radius:var(--radius-pill);background:var(--surface-fg-muted);opacity:.4')} />
        {rows}
      </div>
    </React.Fragment>
  );
  const menu = shown && (
    <div role="menu" aria-label={label}
      style={sx('position:absolute;top:calc(100% + var(--spacing-xs));' + (align === 'start' ? 'left:0' : 'right:0') + ';z-index:20;min-width:260px;max-width:320px;padding:var(--spacing-xs) 0;border-radius:var(--radius-xs);background:var(--surface-card);border:1px solid var(--surface-border);box-shadow:var(--shadow-lg);text-align:left')}>
      {rows}
    </div>
  );
  return (
    <div style={sx('position:relative;display:inline-flex;flex-shrink:0')}>
      {/* Over artwork the button sits on a scrim in on-scrim ink, as a card's corner button does:
          surface ink would vanish on a dark or a light cover. */}
      {tone === 'scrim'
        ? <button aria-label={label} title={label} aria-expanded={shown} onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); set(!shown); }}
            style={sx('width:30px;height:30px;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--scrim-soft);color:var(--on-scrim)')}>
            {glyph('more_vert')}
          </button>
        : IconButton && <IconButton icon="more_vert" label={label} active={shown} onClick={() => set(!shown)} />}
      {mobile ? sheet : menu}
    </div>
  );
}

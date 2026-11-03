import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * States the active sort/filter and opens its picker in one control — the label is data ("All
 * episodes • Newest"), not a fixed name. Given `items`, the picker is an OverflowMenu of them,
 * opened from the label itself, the current one checked.
 */
export function SortFilterBar({ icon = 'tune', label, onClick, items, onSelect, menuLabel = 'Sort', trailing, platform = 'desktop' }) {
  const { OverflowMenu, StateLayer } = NS();
  const [open, setOpen] = React.useState(false);
  // An empty list is no menu: the bar stays the plain control.
  const picks = Array.isArray(items) && items.length > 0 && Boolean(OverflowMenu);
  // The item whose label is the bar's own is the current one, unless the item says otherwise.
  const marked = picks ? items.map((item) => (item.selected === undefined ? { ...item, selected: item.label === label } : item)) : items;
  // With items the label's press opens their menu, and choosing one is the action.
  const off = picks ? !onSelect : !onClick;
  const press = off ? undefined : picks ? () => setOpen(!open) : onClick;
  const mobile = platform === 'mobile';
  const button = (
    <button className="sn-int" onClick={press} disabled={off} aria-haspopup={picks ? 'menu' : undefined} aria-expanded={picks ? open : undefined} style={sx('display:flex;align-items:center;gap:var(--spacing-sm);min-width:0;border:none;background:transparent;cursor:pointer;padding:' + (mobile ? '8px 4px' : '6px 4px'))}>
      <span style={sx("flex-shrink:0;font-family:'Material Symbols Rounded';font-size:var(--icon-sm);line-height:1;color:var(--surface-fg-muted);font-variation-settings:'FILL' 0,'wght' 400")}>{icon}</span>
      <span style={sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-body);font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{label}</span>
      {StateLayer && <StateLayer disabled={off} />}
    </button>
  );
  return (
    <div style={sx('display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);width:100%;background:transparent')}>
      {picks
        ? <OverflowMenu items={marked} label={menuLabel} open={open} onOpenChange={setOpen} onSelect={onSelect} align="start" anchor={button} platform={platform} />
        : button}
      {trailing && <div style={sx('flex-shrink:0')}>{trailing}</div>}
    </div>
  );
}

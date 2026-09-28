import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

/**
 * One row of the play queue: drag handle, art, title/sub, duration and a remove control. In the
 * queue page's edit mode it grows a leading checkbox and drops the duration, so the row's controls
 * are what changes rather than its shape.
 */
export function QueueRow({
  title, sub, time, current = false, platform = 'desktop', onClick, onRemove,
  handle = true, editing = false, selected = false, onSelectToggle,
  draggable = true, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const mobile = platform === 'mobile';
  const art = mobile ? 44 : 40;
  const stop = (fn) => (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (fn) fn(e); };
  const glyph = (name, click, label, grab) => (
    <span onClick={click} title={label} aria-label={label} style={sx("font-family:'Material Symbols Rounded';font-size:" + (mobile ? '22px' : '20px') + ';line-height:1;flex-shrink:0;cursor:' + (grab ? 'grab' : 'pointer') + ';color:var(--surface-fg-muted)')}>{name}</span>
  );
  return (
    <div draggable={draggable && (editing || handle)} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      style={sx('display:flex;align-items:center;gap:var(--spacing-md);padding:var(--spacing-sm);cursor:pointer;transition:background var(--duration-quick) var(--ease-standard);border-radius:var(--radius-' + (mobile ? 'sm' : 'xs') + ');background:' + (selected ? 'var(--surface-hover)' : current ? 'var(--surface-card)' : 'transparent'))}>
      {editing && (
        <span onClick={stop(onSelectToggle)} aria-label={selected ? 'Deselect' : 'Select'}
          style={sx("font-family:'Material Symbols Rounded';font-size:" + (mobile ? '24px' : '22px') + ";line-height:1;flex-shrink:0;cursor:pointer;transition:color var(--duration-quick) var(--ease-standard);font-variation-settings:'FILL' " + (selected ? 1 : 0) + ",'wght' " + (selected ? 500 : 400) + ';color:' + (selected ? 'var(--accent)' : 'var(--surface-fg-muted)'))}>
          {selected ? 'check_circle' : 'radio_button_unchecked'}
        </span>
      )}
      {(handle || editing) && glyph('drag_handle', undefined, 'Drag to reorder', true)}
      <div onClick={onClick} style={sx('position:relative;overflow:hidden;width:' + art + 'px;height:' + art + 'px;flex-shrink:0;border-radius:' + (mobile ? '8px' : '6px') + ';cursor:pointer;background:var(--accent)')} />
      <div onClick={onClick} style={sx('min-width:0;flex:1;cursor:pointer')}>
        <div style={sx('font-size:var(--text-md);font-weight:var(--weight-medium);color:' + (current ? 'var(--play-ink)' : 'var(--surface-fg)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{title}</div>
        <div style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{sub}</div>
      </div>
      {time && !editing && <span style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{time}</span>}
      {onRemove && glyph('close', stop(onRemove), 'Remove from queue')}
    </div>
  );
}

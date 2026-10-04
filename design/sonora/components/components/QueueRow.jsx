import React from 'react';
import { NS, activate, sx } from '../shared.js';

/**
 * One row of the play queue: drag handle, art, title/sub, duration and a remove control. In the
 * queue page's edit mode it grows a leading checkbox and drops the duration, so the row's controls
 * are what changes rather than its shape.
 */
export function QueueRow({
  title, sub, time, image, current = false, platform = 'desktop', onClick, onRemove,
  handle = true, editing = false, selected = false, onSelectToggle,
  draggable = true, onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const { CoverArt, IconButton, StateLayer } = NS();
  const mobile = platform === 'mobile';
  const art = mobile ? 44 : 40;
  const off = !onClick;
  // A press on a control in the row stays its own; one with no handler is drawn disabled.
  const stop = (fn) => (fn ? (e) => { if (e && e.stopPropagation) e.stopPropagation(); fn(e); } : undefined);
  const glyph = (name, size, fill) => (
    <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';line-height:1;font-size:" + size + (fill ? ";font-variation-settings:'FILL' 1,'wght' 500" : ''))}>{name}</span>
  );
  return (
    <div className="sn-int" role="button" tabIndex={off ? -1 : 0} aria-disabled={off}
      onClick={off ? undefined : onClick}
      onKeyDown={off ? undefined : activate(() => onClick())}
      draggable={draggable && (editing || handle)} onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      style={sx('display:flex;align-items:center;gap:var(--spacing-md);padding:var(--spacing-sm);cursor:pointer;transition:background var(--duration-quick) var(--ease-standard);border-radius:var(--radius-' + (mobile ? 'sm' : 'xs') + ');background:' + (selected ? 'color-mix(in oklab, var(--surface-card) 80%, var(--accent))' : current ? 'var(--surface-card)' : 'transparent'))}>
      {editing && IconButton && (
        <IconButton label={selected ? 'Deselect' : 'Select'} size={mobile ? 40 : 36} active={selected} muted={!selected} onClick={stop(onSelectToggle)}>
          {glyph(selected ? 'check_circle' : 'radio_button_unchecked', mobile ? '24px' : '22px', selected)}
        </IconButton>
      )}
      {/* The grip only drags: a press on it is not a press on the row. */}
      {(handle || editing) && (
        <span onClick={(e) => e.stopPropagation()} title="Drag to reorder" aria-label="Drag to reorder"
          style={sx("font-family:'Material Symbols Rounded';font-size:" + (mobile ? '22px' : '20px') + ';line-height:1;flex-shrink:0;cursor:grab;color:var(--surface-fg-muted)')}>drag_handle</span>
      )}
      <div style={sx('position:relative;overflow:hidden;width:' + art + 'px;height:' + art + 'px;flex-shrink:0;border-radius:' + (mobile ? '8px' : '6px') + ';background:var(--accent)')}>
        {image && CoverArt && <CoverArt src={image} alt="" />}
      </div>
      <div style={sx('min-width:0;flex:1')}>
        <div style={sx('font-size:var(--text-md);font-weight:var(--weight-medium);color:' + (current ? 'var(--play-ink)' : 'var(--surface-fg)') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{title}</div>
        <div style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{sub}</div>
      </div>
      {time && !editing && <span style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{time}</span>}
      {onRemove && IconButton && (
        <IconButton label="Remove from queue" size={mobile ? 40 : 36} muted onClick={stop(onRemove)}>{glyph('close', mobile ? '22px' : '20px')}</IconButton>
      )}
      {StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}

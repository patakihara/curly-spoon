import React from 'react';
import { NS, sx } from '../shared.js';

/**
 * A list with an edit mode: out of it the rows are ordinary tappable rows, in it they carry selection
 * and drag handles and the list grows an action bar that sticks to the bottom of the scrolling pane.
 * Selection and drag state live here — the caller owns only the `editing` flag and renders each row.
 */
export function EditableList({
  platform = 'mobile', items = [], itemKey, editing = false, renderRow,
  onReorder, onRemoveSelected, actionLabel = 'Remove',
  hint = 'Drag to reorder, or select rows', gap = 'var(--spacing-xs)',
}) {
  const { Button } = NS();
  const [selected, setSelected] = React.useState([]);
  const [dragFrom, setDragFrom] = React.useState(null);
  React.useEffect(() => { if (!editing) setSelected([]); }, [editing]);
  const keyAt = (it, i) => (itemKey ? itemKey(it, i) : (it && it.id != null ? it.id : (it && it.title) || i));
  const toggle = (k) => setSelected((s) => (s.indexOf(k) > -1 ? s.filter((x) => x !== k) : s.concat([k])));
  return (
    <div style={sx('display:flex;flex-direction:column;gap:' + gap)}>
      {items.map((item, index) => {
        const key = keyAt(item, index);
        return renderRow({
          item, index, key, selected: selected.indexOf(key) > -1, editing,
          toggle: () => toggle(key),
          drag: {
            draggable: editing,
            onDragStart: () => setDragFrom(index),
            onDragOver: (e) => { if (e && e.preventDefault) e.preventDefault(); },
            onDrop: (e) => {
              if (e && e.preventDefault) e.preventDefault();
              if (dragFrom !== null && dragFrom !== index && onReorder) onReorder(dragFrom, index);
              setDragFrom(null);
            },
            onDragEnd: () => setDragFrom(null),
          },
        });
      })}
      {editing && (
        <div style={sx('position:sticky;bottom:0;z-index:1;display:flex;align-items:center;gap:var(--spacing-md);box-sizing:border-box;margin-top:var(--spacing-sm);padding:var(--spacing-sm) 0;background:var(--surface-bg);border-top:1px solid var(--surface-border)')}>
          <span style={sx('flex:1;min-width:0;font-size:var(--text-sm);color:var(--surface-fg-muted)')}>
            {selected.length ? selected.length + ' selected' : hint}
          </span>
          {Button && (
            <Button variant="ghost" platform={platform} disabled={!selected.length}
              onClick={() => { if (onRemoveSelected) onRemoveSelected(selected); setSelected([]); }}>{actionLabel}</Button>
          )}
        </div>
      )}
    </div>
  );
}

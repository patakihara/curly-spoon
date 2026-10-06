import React from 'react';
import { NS, sx } from '../shared.js';

/** Settings list row: title, explanatory line, and a Switch. */
export function SettingRow({ title, sub, checked = false, platform = 'desktop', onChange }) {
  const { ListRow, Switch } = NS();
  return ListRow ? (
    <ListRow platform={platform} density="card" surface="card" trailing={Switch && <Switch checked={!!checked} onChange={onChange} />}>
      <div style={sx('font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{title}</div>
      <div style={sx('font-size:var(--text-sm);line-height:1.5;color:var(--surface-fg-muted)')}>{sub}</div>
    </ListRow>
  ) : null;
}

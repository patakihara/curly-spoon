import React from 'react';
import { NS, sx } from '../shared.js';

/** Label + value on a filled card — playback speed, sleep timer, any read-only setting readout. */
export function ValueRow({ label, value, platform = 'desktop', onClick }) {
  const ListRow = NS().ListRow;
  return ListRow ? (
    <ListRow platform={platform} density="card" surface="card" onClick={onClick} disabled={!onClick}
      trailing={<span style={sx('font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{value}</span>}>
      <span style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{label}</span>
    </ListRow>
  ) : null;
}

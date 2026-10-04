import React from 'react';
import { NS, sx } from '../shared.js';

/** States the active sort/filter and opens its picker in one control — the label is data ("All episodes • Newest"), not a fixed name. */
export function SortFilterBar({ icon = 'tune', label, onClick, trailing, platform = 'desktop' }) {
  const { StateLayer, Icon } = NS();
  const off = !onClick;
  const mobile = platform === 'mobile';
  return (
    <div style={sx('display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);width:100%;background:transparent')}>
      <button className="sn-int" onClick={off ? undefined : onClick} disabled={off} style={sx('display:flex;align-items:center;gap:var(--spacing-sm);min-width:0;border:none;background:transparent;cursor:pointer;padding:' + (mobile ? '8px 4px' : '6px 4px'))}>
        <Icon name={icon} style={sx('flex-shrink:0;color:var(--surface-fg-muted)')} />
        <span style={sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-body);font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{label}</span>
        {StateLayer && <StateLayer disabled={off} />}
      </button>
      {trailing && <div style={sx('flex-shrink:0')}>{trailing}</div>}
    </div>
  );
}

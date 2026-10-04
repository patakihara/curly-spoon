import React from 'react';
import { NS, activate, sx } from '../shared.js';
// Enter and Space press it as a click does, unless they come from a control inside it.

/** Label + value on a filled card — playback speed, sleep timer, any read-only setting readout. */
export function ValueRow({ label, value, platform = 'desktop', onClick }) {
  const StateLayer = NS().StateLayer;
  const mobile = platform === 'mobile';
  const off = !onClick;
  return (
    <div className="sn-int" role="button" tabIndex={off ? -1 : 0} aria-disabled={off}
      onClick={off ? undefined : onClick} onKeyDown={off ? undefined : activate(onClick)}
      style={sx('display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-lg);box-sizing:border-box;width:100%;padding:' + (mobile ? '14px 16px' : '12px 14px') + ';border-radius:var(--radius-' + (mobile ? 'sm' : 'xs') + ');background:var(--surface-card);cursor:pointer')}>
      <span style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{label}</span>
      <span style={sx('font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{value}</span>
      {StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}

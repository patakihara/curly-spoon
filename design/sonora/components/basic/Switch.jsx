import React from 'react';
import { NS } from '../shared.js';

export function Switch({ checked, onChange, label }) {
  const StateLayer = NS().StateLayer;
  const off = !onChange;
  const flip = () => onChange(!checked);
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--spacing-md)', cursor: off ? 'default' : 'pointer' }}>
      {label && <span style={{ color: 'var(--surface-fg)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)' }}>{label}</span>}
      <button type="button" className="sn-int sn-filled" role="switch" aria-checked={!!checked} aria-label={label} disabled={off}
        onClick={off ? undefined : flip}
        style={{
          width: 40, height: 24, borderRadius: 999, position: 'relative', flexShrink: 0, cursor: 'pointer', padding: 0, border: 'none',
          background: checked ? 'var(--accent)' : 'var(--surface-border)', transition: 'background 0.15s ease',
        }}>
        <span style={{
          position: 'absolute', top: 3, left: checked ? 19 : 3, width: 18, height: 18, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s ease', boxShadow: 'var(--shadow-xs)',
        }} />
        {StateLayer && <StateLayer disabled={off} />}
      </button>
    </label>
  );
}

import React from 'react';

const hueVars = {
  red:'--accent-red',orange:'--accent-orange',amber:'--accent-amber',yellow:'--accent-yellow',
  lime:'--accent-lime',green:'--accent-green',emerald:'--accent-emerald',teal:'--accent-teal',
  cyan:'--accent-cyan',sky:'--accent-sky',blue:'--accent-blue',indigo:'--accent-indigo',
  violet:'--accent-violet',purple:'--accent-purple',fuchsia:'--accent-fuchsia',pink:'--accent-pink',rose:'--accent-rose',
};

export function Chip({ children, color, count, selected, platform = 'mobile', onClick }) {
  const bg = color ? `var(${hueVars[color] || '--accent-indigo'})` : selected ? 'var(--accent)' : 'var(--surface-card)';
  const radius = 'var(--radius-md)';
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
      gap: 2, padding: color ? '14px 16px' : '6px 14px', minWidth: color ? 120 : undefined,
      borderRadius: radius, border: selected || color ? 'none' : '1px solid var(--surface-border)',
      background: bg, color: color ? '#fff' : selected ? 'var(--accent-contrast)' : 'var(--surface-fg)',
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-md)', cursor: 'pointer',
    }}>
      {children}
      {count != null && <span style={{ fontWeight: 500, fontSize: 'var(--text-xs)', opacity: 0.8 }}>{count} songs</span>}
    </button>
  );
}

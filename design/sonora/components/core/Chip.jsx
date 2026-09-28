import React from 'react';

export function Chip({ children, count, selected, platform = 'mobile', onClick }) {
  const radius = 'var(--radius-md)';
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
      gap: 2, padding: '6px 14px',
      borderRadius: radius, border: selected ? 'none' : '1px solid var(--surface-border)',
      background: selected ? 'var(--accent)' : 'var(--surface-card)', color: selected ? 'var(--accent-contrast)' : 'var(--surface-fg)',
      fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-md)', cursor: 'pointer',
    }}>
      {children}
      {count != null && <span style={{ fontWeight: 'var(--weight-body)', fontSize: 'var(--text-xs)', opacity: 0.8 }}>{count} songs</span>}
    </button>
  );
}

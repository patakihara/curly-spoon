import React from 'react';

/** Row heading above a carousel or grid, with an optional trailing action. */
export function SectionHeader({ title, action, actionLabel = 'More', onAction, platform = 'mobile' }) {
  const isMobile = platform === 'mobile';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)', gap: 'var(--spacing-md)' }}>
      <div style={{
        color: 'var(--surface-fg)',
        fontFamily: isMobile ? 'var(--font-body)' : 'var(--font-heading)',
        fontWeight: isMobile ? 700 : 900,
        fontSize: isMobile ? 'var(--text-xl)' : 'var(--h3-size)',
      }}>{title}</div>
      {action && (
        <button aria-label={actionLabel} onClick={onAction} style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', color: 'var(--surface-fg-muted)',
          cursor: 'pointer', fontFamily: 'Material Symbols Rounded', fontSize: 'var(--icon-sm)',
        }}>{action}</button>
      )}
    </div>
  );
}

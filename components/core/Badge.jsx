import React from 'react';

const TONES = {
  accent: ['var(--accent)', 'var(--accent-contrast)'],
  success: ['var(--tone-library)', 'var(--tone-library-ink)'],
  warning: ['var(--tone-request)', 'var(--tone-request-ink)'],
  error: ['var(--tone-error)', 'var(--tone-error-ink)'],
  neutral: ['var(--surface-card)', 'var(--surface-fg)'],
};

export function Badge({ children, tone = 'accent', size = 'sm' }) {
  const [bg, fg] = TONES[tone] || TONES.accent;
  const lg = size === 'md';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: lg ? 24 : 18, height: lg ? 24 : 18, padding: lg ? '0 12px' : '0 5px',
      borderRadius: 'var(--radius-pill)', background: bg, color: fg, whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700,
    }}>{children}</span>
  );
}

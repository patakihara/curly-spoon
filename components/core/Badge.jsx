import React from 'react';

const TONES = {
  accent: ['var(--accent)', 'var(--accent-contrast)'],
  success: ['var(--tone-library)', 'var(--tone-library-ink)'],
  warning: ['var(--tone-request)', 'var(--tone-request-ink)'],
  error: ['var(--tone-error)', 'var(--tone-error-ink)'],
  neutral: ['var(--surface-card)', 'var(--surface-fg)'],
};

export function Badge({ children, tone = 'accent', size = 'sm', icon, square = false, plain = false }) {
  const [bg, fg] = TONES[tone] || TONES.accent;
  const lg = size === 'md';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: icon ? 4 : undefined,
      minWidth: lg ? 24 : 18, height: lg ? 24 : 18, padding: lg ? '0 12px' : '0 5px',
      // square+plain are attribute markers ("E", "Verified") rather than counters, so they trade
      // the filled pill for an outline-free glyph+label pair that takes the tone colour as ink.
      borderRadius: square ? 'var(--radius-xs)' : 'var(--radius-pill)',
      // `neutral`'s "tone colour" is the card surface itself, which would be invisible as ink on
      // a transparent background — fall back to the plain foreground for that one tone.
      background: plain ? 'transparent' : bg, color: plain ? (tone === 'neutral' ? fg : bg) : fg, whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 700,
    }}>
      {icon && <span aria-hidden="true" style={{ fontFamily: "'Material Symbols Rounded'", fontSize: 'var(--icon-xs)', lineHeight: 1, fontVariationSettings: "'FILL' 1,'wght' 500" }}>{icon}</span>}
      {children}
    </span>
  );
}

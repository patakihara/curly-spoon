import React from 'react';
import { NS, sx } from '../shared.js';

/** Labelled form field. Supplies the filled container the chromeless mobile Input expects. */
export function FieldRow({ label, placeholder, value, platform = 'desktop', onChange }) {
  const Input = NS().Input;
  const mobile = platform === 'mobile';
  return (
    <div style={sx('display:flex;flex-direction:column;gap:var(--spacing-sm)')}>
      <div style={sx('font-size:var(--text-sm);font-weight:var(--weight-strong);color:var(--surface-fg-muted)')}>{label}</div>
      <div style={mobile ? sx('background:var(--surface-card);border-radius:var(--radius-pill);padding:var(--spacing-xs) var(--spacing-sm)') : undefined}>
        {Input && <Input placeholder={placeholder} value={value} platform={platform} onChange={onChange} />}
      </div>
    </div>
  );
}

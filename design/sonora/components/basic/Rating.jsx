import React from 'react';
import { NS, sx } from '../shared.js';

// 17700 -> "17.7K": one decimal below 100 of the unit, none above, so it never grows past 4 chars.
function compact(n) {
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const units = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [div, suffix] of units) {
    if (abs >= div) {
      const v = n / div;
      return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + suffix;
    }
  }
  return String(n);
}

/** Aggregate community judgement at a glance — a single star and the value, not five glyphs; the number carries the information. */
export function Rating({ value, count, max = 5, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const Icon = NS().Icon;
  const display = typeof value === 'number' ? value.toFixed(1) : '';
  const countText = typeof count === 'number' ? compact(count) : null;
  const label = 'Rated ' + display + ' out of ' + max + (typeof count === 'number' ? ' by ' + count.toLocaleString() + ' listeners' : '');
  return (
    <div role="img" aria-label={label} style={sx('display:inline-flex;align-items:center;gap:4px;font-family:var(--font-body)')}>
      <Icon name="star" size={mobile ? 'xs' : 'sm'} filled weight="strong" style={sx('color:var(--surface-fg)')} />
      <span aria-hidden="true" style={sx('font-size:var(--text-' + (mobile ? 'sm' : 'md') + ');font-weight:var(--weight-strong);color:var(--surface-fg)')}>{display}</span>
      {countText && <span aria-hidden="true" style={sx('font-size:var(--text-sm);color:var(--surface-fg-muted)')}>({countText})</span>}
    </div>
  );
}

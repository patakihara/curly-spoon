import React from 'react';
import { NS, sx } from '../shared.js';

/** What a page shows when it has nothing to show: a glyph, the fact in a heading and a line, and the one way on. Centred in its column, no filler copy. */
export function EmptyState({ icon, title, body, action, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const Icon = NS().Icon;
  return (
    <div role="status" style={sx('display:flex;flex-direction:column;align-items:center;text-align:center;gap:var(--spacing-md);box-sizing:border-box;width:100%;max-width:var(--grid-max-width-form);margin:0 auto;padding:var(--spacing-2xl) var(--spacing-lg)')}>
      {icon && (
        <div aria-hidden="true" style={sx('display:flex;align-items:center;justify-content:center;width:calc(var(--icon-md) * 2);height:calc(var(--icon-md) * 2);border-radius:50%;background:var(--surface-card);color:var(--surface-fg-muted)')}>
          <Icon name={icon} size="md" />
        </div>
      )}
      <div style={sx('font-family:var(--font-heading);font-weight:var(--heading-weight);font-size:var(--' + (mobile ? 'text-2xl' : 'h4-size') + ');line-height:1.2;color:var(--surface-fg)')}>{title}</div>
      {body && <div style={sx('font-family:var(--font-body);font-size:var(--text-md);line-height:1.5;color:var(--surface-fg-muted)')}>{body}</div>}
      {action && <div style={sx('display:flex;justify-content:center;margin-top:var(--spacing-sm)')}>{action}</div>}
    </div>
  );
}

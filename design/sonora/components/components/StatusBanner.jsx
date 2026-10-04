import React from 'react';
import { NS, sx } from '../shared.js';

// There is no --state-*-ink family; the readable pairings live on the tone tokens, and info has
// no tone of its own. Naming both halves here — the way Badge does — is what keeps the label
// legible on --state-warning, which is a pale peach that inherited light text disappears into.
const TONES = {
  info: ['var(--state-info)', 'var(--accent-contrast)'],
  success: ['var(--state-success)', 'var(--state-success-ink)'],
  warning: ['var(--tone-request)', 'var(--tone-request-ink)'],
  error: ['var(--tone-error)', 'var(--tone-error-ink)'],
};

/** Persistent, non-blocking statement of system state — Spotify's "You're offline" bar. Unlike a toast it never times out. */
export function StatusBanner({ children, tone = 'info', icon, actionLabel, onAction, onDismiss }) {
  const [bg, fg] = TONES[tone] || TONES.info;
  const { StateLayer, Icon } = NS();
  return (
    <div role="status" aria-live="polite"
      style={sx('display:flex;align-items:center;gap:var(--spacing-md);width:100%;box-sizing:border-box;padding:var(--spacing-sm) var(--spacing-lg);background:' + bg + ';color:' + fg)}>
      {icon && <Icon name={icon} filled weight="strong" style={sx('flex-shrink:0')} />}
      <div style={sx('flex:1;min-width:0;font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--weight-body)')}>{children}</div>
      {actionLabel && (
        <button className="sn-int" onClick={onAction} disabled={!onAction} style={sx('flex-shrink:0;border:none;background:transparent;cursor:pointer;padding:var(--spacing-xs) var(--spacing-sm);margin:calc(-1 * var(--spacing-xs)) calc(-1 * var(--spacing-sm));border-radius:var(--radius-xs);font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--weight-strong);color:inherit;text-decoration:underline')}>
          {actionLabel}
          {StateLayer && <StateLayer disabled={!onAction} />}
        </button>
      )}
      {onDismiss && (
        <button className="sn-int" onClick={onDismiss} aria-label="Dismiss"
          style={sx('flex-shrink:0;display:flex;align-items:center;justify-content:center;width:var(--icon-md);height:var(--icon-md);border:none;border-radius:50%;background:transparent;cursor:pointer;padding:0;color:inherit')}>
          <Icon name="close" />
          {StateLayer && <StateLayer />}
        </button>
      )}
    </div>
  );
}

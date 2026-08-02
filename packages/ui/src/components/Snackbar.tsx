/**
 * A single transient message, driven by `useSnackbar`'s queue. Announced politely so
 * screen reader users hear it without it stealing focus.
 */
import { Icon } from './Icon.js';
import type { SnackbarMessage } from './useSnackbar.js';
import './Snackbar.css';

export interface SnackbarProps {
  snackbar: SnackbarMessage | null;
  onDismiss: () => void;
}

export function Snackbar({ snackbar, onDismiss }: SnackbarProps) {
  if (!snackbar) return null;

  return (
    <div className="m3-snackbar" role="status" aria-live="polite">
      <span className="m3-snackbar__message">{snackbar.message}</span>
      {snackbar.actionLabel ? (
        <button
          type="button"
          className="m3-snackbar__action"
          onClick={() => {
            snackbar.onAction?.();
            onDismiss();
          }}
        >
          {snackbar.actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="m3-snackbar__close m3-hit-slop"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

/**
 * A single transient message, driven by `useSnackbar`'s queue. Announced politely so
 * screen reader users hear it without it stealing focus.
 *
 * Mantine migration: renders `@mantine/core`'s `<Notification>` for the chrome
 * (background, shadow, radius, close button) instead of bespoke M3 markup. This is
 * deliberately *not* a switch to `@mantine/notifications`' imperative `notifications.show()`
 * system — that needs a `<Notifications limit={1} />` mounted once, globally, and the
 * only sane mount points (`ThemeProvider.tsx`, `index.ts`) are out of scope for this
 * migration; it also portals to `document.body` by default, which would escape
 * `e2e/ui/snackbar.spec.ts`'s `getByTestId('snackbar-display')`-scoped locator. So the
 * controlled `{ snackbar, onDismiss }` props stay exactly as they were — `useSnackbar`'s
 * queue/dismiss/timeout logic underneath is untouched — and only the single message's
 * presentation moves to Mantine.
 *
 * `role="status"` overrides `Notification`'s own default of `role="alert"` (this
 * queue is a polite announcement, not an interrupting one) and `aria-live="polite"`
 * is passed through alongside it, matching the contract this component has always had.
 */
import { Notification } from '@mantine/core';
import type { SnackbarMessage } from './useSnackbar.js';
import './Snackbar.css';

export interface SnackbarProps {
  snackbar: SnackbarMessage | null;
  onDismiss: () => void;
}

export function Snackbar({ snackbar, onDismiss }: SnackbarProps) {
  if (!snackbar) return null;

  return (
    <Notification
      className="m3-snackbar"
      role="status"
      aria-live="polite"
      withCloseButton
      onClose={onDismiss}
      closeButtonProps={{ 'aria-label': 'Dismiss' }}
    >
      <div className="m3-snackbar__body-row">
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
      </div>
    </Notification>
  );
}

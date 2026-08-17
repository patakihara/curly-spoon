/**
 * Modal dialog — a centred, focus-trapped surface for confirmations and short forms.
 *
 * Thin wrapper around Mantine's `Modal`, which replaces this component's own
 * `createPortal` + `useFocusTrap` plumbing: Mantine's `Modal` already portals,
 * traps focus, closes on Escape/outside-click, and locks body scroll.
 *
 * Deliberately *not* `unstyled`: Mantine's `Modal` (unlike `Card`) keeps its
 * outer positioning wrapper mounted in the DOM at all times, even while closed —
 * its own default CSS is what makes that wrapper invisible and non-interactive
 * when not open. `unstyled` strips that default CSS wholesale (it does forward
 * from `Modal` all the way to `ModalBase`, unlike `Card`'s `Paper`), and this
 * component's own `.m3-dialog-*` classes have no closed-state hiding of their own
 * (the pre-migration version simply never rendered when `!open`) — the result was
 * a permanently full-viewport, click-intercepting `m3-dialog-layer` div sitting
 * over the whole app even with the dialog closed, confirmed by driving the
 * gallery with Playwright. So `root` is left off `classNames` and Mantine's own
 * default show/hide behaviour is kept; only the inner, purely-cosmetic slots
 * (overlay/content/title/body) get this component's existing `.m3-dialog-*`
 * classes layered on top, reusing `Dialog.css` unchanged. `useFocusTrap` itself
 * (packages/ui/src/internal/useFocusTrap.ts) stays — `Sheet.tsx` still uses it.
 *
 * Two more fixes found the same way (screenshotting the gallery, not just
 * reading source) — both are the same "inline beats class" lever:
 *  - `.m3-dialog-scrim`'s translucency is hand-rolled as an opaque
 *    `background: var(--m3-scrim)` plus a *separate* `opacity: 0.32` on the
 *    whole element. Mantine's own `Transition` drives that same element's
 *    mount/unmount fade via an *inline* `opacity`, which settles to `1` once
 *    open and stomps the class's `opacity: 0.32` — and the class's opaque
 *    `background` then wins the leftover cascade tie against Mantine's own
 *    (correct, rgba-based) overlay background, leaving a solid black scrim.
 *    `styles.overlay` sets the translucent background *inline*, so it can't
 *    lose to either of those.
 *  - Mantine's header (which wraps `title`) sets its own sticky
 *    `background-color: var(--mantine-color-body)` — dark in dark mode —
 *    producing a visible dark patch behind the title on `.m3-dialog-panel`'s
 *    cream background. `styles.header` clears it inline for the same reason.
 *
 * `.m3-dialog-scrim` is kept in `classNames.overlay` (rather than dropped)
 * because `e2e/ui/dialog.spec.ts` selects the scrim by that class to test the
 * click-to-dismiss behaviour — dropping it would silently break that spec.
 *
 * Wave 16c-4-W: `portalProps={{ target: portalTarget }}` re-parents the portal from
 * Mantine's default (`document.body`, outside `.auralis-theme-root`, where Sonora's
 * `--surface-*`/`--accent-ink` resolve to nothing) into the node `ThemeProvider` renders
 * for exactly this purpose — see `useTheme`'s `portalTarget` doc comment. `undefined`
 * (never `null`) falls back to Mantine's own default portal target for the one render
 * before `ThemeProvider`'s ref callback fires.
 */
import type { ReactNode } from 'react';
import { Modal } from '@mantine/core';
import { useTheme } from '../theme/ThemeProvider.js';
import './Dialog.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  /** Clicking the scrim closes the dialog. Defaults to true. */
  dismissOnScrimClick?: boolean;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  actions,
  dismissOnScrimClick = true,
}: DialogProps) {
  const { portalTarget } = useTheme();
  return (
    <Modal
      opened={open}
      onClose={() => onOpenChange(false)}
      title={title}
      centered
      withCloseButton={false}
      closeOnClickOutside={dismissOnScrimClick}
      portalProps={{ target: portalTarget ?? undefined }}
      classNames={{
        overlay: 'm3-dialog-scrim',
        content: 'm3-dialog-panel',
        title: 'm3-dialog-title',
        body: 'm3-dialog-content',
      }}
      styles={{
        header: { backgroundColor: 'transparent' },
        overlay: { background: 'rgba(0, 0, 0, 0.32)' },
      }}
    >
      {children}
      {actions ? <div className="m3-dialog-actions">{actions}</div> : null}
    </Modal>
  );
}

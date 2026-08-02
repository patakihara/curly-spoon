/**
 * Modal dialog — a centred, focus-trapped surface for confirmations and short forms.
 * Enters with a spring (`spring.default`, the same one cards/FABs use) rather than a
 * plain fade.
 */
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../internal/useFocusTrap.js';
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useFocusTrap(open, panelRef, () => onOpenChange(false));

  if (!open) return null;

  return createPortal(
    <div className="m3-dialog-layer">
      <div
        className="m3-dialog-scrim"
        aria-hidden="true"
        onClick={() => dismissOnScrimClick && onOpenChange(false)}
      />
      <div
        ref={panelRef}
        className="m3-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="m3-dialog-title">
          {title}
        </h2>
        <div className="m3-dialog-content">{children}</div>
        {actions ? <div className="m3-dialog-actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

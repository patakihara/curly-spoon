/**
 * Bottom sheet — the primary surface for secondary UI in Auralis (docs/DESIGN.md:
 * "bottom-sheet-first secondary UI", "queue as an upward swipe"). Drag the handle to
 * resize between `detents`, or past the smallest one to dismiss; it always springs
 * (spring.slow, the same spring DESIGN.md assigns to "Sheets, Now Playing expansion")
 * to wherever it settles rather than snapping.
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useFocusTrap } from '../internal/useFocusTrap.js';
import './Sheet.css';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fractions of viewport height the sheet can rest at, smallest first. Default `[1]`. */
  detents?: number[];
  /** Index into `detents` to open at. */
  initialDetent?: number;
  title?: ReactNode;
  children?: ReactNode;
  'aria-label'?: string;
}

export function Sheet({
  open,
  onOpenChange,
  detents = [1],
  initialDetent = 0,
  title,
  children,
  'aria-label': ariaLabel,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const titleId = useId();

  const [activeDetent, setActiveDetent] = useState(Math.min(initialDetent, detents.length - 1));
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useFocusTrap(open, panelRef, () => onOpenChange(false));

  if (!open) return null;

  const detentPx = (fraction: number) => fraction * window.innerHeight;
  const smallestDetentPx = detentPx(Math.min(...detents));
  const currentHeightPx = dragHeightPx ?? detentPx(detents[activeDetent] ?? 1);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      startY: event.clientY,
      startHeight: panelRef.current?.getBoundingClientRect().height ?? currentHeightPx,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStateRef.current) return;
    const deltaY = event.clientY - dragStateRef.current.startY;
    const nextHeight = Math.max(0, dragStateRef.current.startHeight - deltaY);
    setDragHeightPx(nextHeight);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    const finalHeight = dragHeightPx ?? currentHeightPx;

    if (finalHeight < smallestDetentPx * 0.5) {
      onOpenChange(false);
      setDragHeightPx(null);
      return;
    }

    // Snap to whichever detent the release height is closest to.
    let nearestIndex = 0;
    let nearestDistance = Infinity;
    detents.forEach((fraction, index) => {
      const distance = Math.abs(detentPx(fraction) - finalHeight);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setActiveDetent(nearestIndex);
    setDragHeightPx(null);
  };

  return createPortal(
    <div className="m3-sheet-layer">
      <div className="m3-sheet-scrim" onClick={() => onOpenChange(false)} aria-hidden="true" />
      <div
        ref={panelRef}
        className={clsx('m3-sheet-panel', dragging && 'm3-sheet-panel--dragging')}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={!ariaLabel && title ? titleId : undefined}
        tabIndex={-1}
        style={{ height: `${currentHeightPx}px` }}
      >
        <div
          className="m3-sheet-handle-area"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="m3-sheet-handle" />
        </div>
        {title ? (
          <h2 id={titleId} className="m3-sheet-title">
            {title}
          </h2>
        ) : null}
        <div className="m3-sheet-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

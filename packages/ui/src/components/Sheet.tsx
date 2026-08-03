/**
 * Bottom sheet — the primary surface for secondary UI in Auralis (docs/DESIGN.md:
 * "bottom-sheet-first secondary UI", "queue as an upward swipe"). Drag the handle to
 * resize between `detents`, or past the smallest one to dismiss; it always springs
 * (spring.slow, the same spring DESIGN.md assigns to "Sheets, Now Playing expansion")
 * to wherever it settles rather than snapping.
 *
 * Mantine migration: `Drawer.Root`/`Overlay`/`Content` supply the modal machinery —
 * portal, scrim, focus trap, Escape-to-close, click-outside-to-close, scroll lock,
 * return-focus-on-close — replacing this file's old hand-rolled `createPortal` +
 * `useFocusTrap`. The detent/drag-to-resize gesture has no Mantine equivalent (Drawer
 * only supports a fixed `size`), so it stays bespoke: `size` is re-passed on every
 * pointer-move frame, and the drag math below is otherwise unchanged from before the
 * migration.
 *
 * `transitionProps={{ duration: 0 }}` on both Root pieces disables Mantine's own
 * enter/exit animation (a permanent inline `transform: translateY(0)`, which would
 * both fight our spring easing and never compute back to `transform: none` the way
 * `e2e/ui/sheet.spec.ts` expects) in favour of this file's own `Sheet.css` keyframes,
 * which behave exactly as they did pre-migration.
 *
 * See `Sheet.css`'s header comment for a load-bearing gotcha this file's styling
 * depends on: `Drawer.Content`'s `className`/`style` are applied by Mantine to *two*
 * different DOM nodes, not one, and the panel-specific CSS rules are scoped
 * accordingly so they don't leak onto the other one.
 */
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import clsx from 'clsx';
import { Drawer } from '@mantine/core';
import './Sheet.css';

/**
 * How far the handle must travel before a drag counts as a decision rather than a
 * twitch. Roughly the distance a thumb moves without meaning to.
 */
const DETENT_COMMIT_PX = 24;

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

  const detentPx = (fraction: number) =>
    fraction * (typeof window !== 'undefined' ? window.innerHeight : 0);
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

    const startHeight = dragStateRef.current?.startHeight ?? currentHeightPx;
    const finalHeight = dragHeightPx ?? startHeight;
    dragStateRef.current = null;
    setDragHeightPx(null);

    // Dragged so far down that the sheet is mostly gone: dismiss, whichever detent
    // the gesture started from.
    if (finalHeight < smallestDetentPx * 0.5) {
      onOpenChange(false);
      return;
    }

    const travel = finalHeight - startHeight; // positive = dragged upward, i.e. taller

    // Short gestures read as a nudge rather than an intent — settle back where we were.
    if (Math.abs(travel) < DETENT_COMMIT_PX) return;

    // Direction beats proximity. Snapping to the *nearest* detent ignores what the
    // user was doing: a deliberate upward drag that stops short of the midpoint would
    // fall back to where it started, which feels like the sheet fighting the gesture.
    // One decisive drag moves exactly one detent, the way the YouTube Music queue does.
    const nextIndex = activeDetent + (travel > 0 ? 1 : -1);
    if (nextIndex < 0) {
      onOpenChange(false);
      return;
    }
    setActiveDetent(Math.min(nextIndex, detents.length - 1));
  };

  return (
    <Drawer.Root
      opened={open}
      onClose={() => onOpenChange(false)}
      position="bottom"
      size={currentHeightPx}
      transitionProps={{ duration: 0 }}
      // `--drawer-justify: center`: Mantine's own value is unset (`flex-start`)
      // for a bottom drawer, since a full-width drawer never needs centering —
      // but this panel caps out at 720px (below), so it needs centering in the
      // positioning row on wide viewports, the way the old
      // `.m3-sheet-layer { justify-content: center }` wrapper did.
      style={{ '--drawer-justify': 'center' } as CSSProperties}
    >
      <Drawer.Overlay
        className="m3-sheet-scrim"
        style={{ background: 'var(--m3-scrim)', opacity: 0.32 }}
        transitionProps={{ duration: 0 }}
      />
      <Drawer.Content
        ref={panelRef}
        className={clsx('m3-sheet-panel', dragging && 'm3-sheet-panel--dragging')}
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
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
      </Drawer.Content>
    </Drawer.Root>
  );
}

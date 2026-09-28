import { ReactNode } from 'react';

/**
 * Responsive card grid — the vertical half of the grid system (Shelf is the horizontal half).
 * By default it auto-fills columns no narrower than `--grid-item-min`, so a shelf of media
 * cards reflows without breakpoints. A standard grid fills its row: the columns share what the
 * minimum leaves, so a wider pane adds a column instead of an empty end, and a narrow pane shrinks
 * its cards to a third of the row rather than dropping below three across. Pass `columns` when
 * the count is part of the design (mobile "Jump back in" is always 2-up).
 */
export interface LayoutGridProps {
  children?: ReactNode;
  /**
   * Fixed column count. Rarely needed — prefer letting the item minimums decide, so the same
   * grid reflows in a narrow pane as well as it does on a phone.
   */
  columns?: number;
  /**
   * Item shape, which selects the minimum-width token: 'standard' for square media cards
   * (`--grid-item-min`), 'wide' for horizontal tiles like QuickPick (`--grid-item-min-wide`).
   * The standard mobile token is tuned to auto-fill to three columns on a phone; wide tiles are
   * capped at `--grid-item-max-wide` instead of filling the row.
   */
  item?: 'standard' | 'wide';
  /** Explicit minimum width, overriding the `item` token. */
  min?: string;
  /**
   * Gap override. Defaults to `--grid-gutter` (`--grid-gutter-mobile` on mobile), and to half
   * of `--grid-gutter` for wide items on desktop.
   */
  gap?: string;
  /** Measure cap, e.g. `var(--grid-max-width)`. */
  maxWidth?: string;
  platform?: 'desktop' | 'mobile';
}
export declare function LayoutGrid(props: LayoutGridProps): JSX.Element;

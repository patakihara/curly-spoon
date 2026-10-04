import { ReactNode } from 'react';

/**
 * Horizontal carousel row, scrolling in a ScrollArea on the `x` axis. Negative side margins pull
 * the ScrollArea's clipped frame out to the page edge while matching padding keeps the first item
 * aligned to the gutter — so cards scroll off-screen rather than stopping at the content padding,
 * and nothing runs past the page, at the end of the row or anywhere else. `margin` must match the
 * page's own padding.
 *
 * Affordances differ by platform, matching the input: desktop gets circular arrows that fade in
 * on hover or keyboard focus and page by `step` whole items (measured from the first child, not
 * a guessed pixel amount), disabling themselves at each end. Mobile gets ScrollArea's fading overlay thumb
 * instead, since a touch surface has no hover state to reveal arrows.
 */
export interface ShelfProps {
  children?: ReactNode;
  /** Gap between items. Defaults to `--grid-gutter`. */
  gap?: string;
  /** The page padding to bleed past. Defaults to `--grid-margin`. */
  margin?: string;
  platform?: 'desktop' | 'mobile';
  /** How many items an arrow press advances. Default 2. */
  step?: number;
  /** Force the paging arrows on or off. Defaults to on for desktop, off for mobile. */
  arrows?: boolean;
  /** Force ScrollArea's fading overlay thumb on or off. Defaults to on for mobile, off for desktop. */
  scrollbar?: boolean;
}
export declare function Shelf(props: ShelfProps): JSX.Element;

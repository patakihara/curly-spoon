import { ReactNode, CSSProperties, UIEvent } from 'react';

/**
 * Scroll container with an Android-style overlay scrollbar — the thumb appears while the user
 * scrolls and fades out `--duration-linger` after they stop, on every platform including desktop.
 * Native scrollbars are suppressed, and the thumb is an overlay, so content never reflows when
 * it appears. Its size, inset, minimum length, opacity and timings are tokens (`--scrollbar-*`,
 * `--opacity-scrollbar`, `--duration-*`).
 *
 * It scrolls one axis: the other is hidden, so content can never make it scroll sideways (on
 * `y`) or up and down (on `x`), and the thumb sits inside its clipped frame, so it never widens
 * whatever holds the ScrollArea. On `x`, a swipe past the end stays in the ScrollArea rather than
 * moving the page.
 *
 * SideSheet, FrontLayer and the player's pages scroll in it, and Shelf scrolls in it on `x`; wrap
 * your own scrollers in it when a screen owns its scrolling.
 */
export interface ScrollAreaProps {
  children?: ReactNode;
  /** The scrolling element's id, for a control that names it (`aria-controls`). */
  id?: string;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** Applied to the inner scrolling element — padding, background, a flex row, etc. */
  style?: CSSProperties;
  /** Ref to the scrolling element itself — for saving and restoring scroll position. */
  scrollRef?: { current: HTMLDivElement | null } | ((el: HTMLDivElement | null) => void);
  /** The axis it scrolls: `y` down the right edge, `x` along the bottom. Default `y`. */
  axis?: 'y' | 'x';
  /** Draw the overlay thumb. Default true; Shelf turns it off on desktop, where arrows page it. */
  thumb?: boolean;
  /**
   * Fade the start and end edges (top and bottom on `y`, left and right on `x`) by
   * `--scroll-edge-fade` to mark content running past them — the start fade only appears once
   * scrolled off the start, the end fade disappears at the end.
   */
  edgeFade?: boolean;
}
export declare function ScrollArea(props: ScrollAreaProps): JSX.Element;

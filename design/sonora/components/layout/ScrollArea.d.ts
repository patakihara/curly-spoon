import { ReactNode, CSSProperties, UIEvent } from 'react';

/**
 * Scroll container with an Android-style overlay scrollbar — the thumb appears while the user
 * scrolls and fades out `hideAfter` ms after they stop, on every platform including desktop.
 * Native scrollbars are suppressed, and the thumb is an overlay, so content never reflows when
 * it appears.
 *
 * ContentPane and SideSheet use this internally; wrap your own scrollers in it when a screen
 * owns its scrolling (mobile pages under `AppShell scroll={false}`).
 */
export interface ScrollAreaProps {
  children?: ReactNode;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** Applied to the inner scrolling element — padding, background, etc. */
  style?: CSSProperties;
  /** Ref to the scrolling element itself — for saving and restoring scroll position. */
  scrollRef?: { current: HTMLDivElement | null } | ((el: HTMLDivElement | null) => void);
  axis?: 'y' | 'x';
  /** Thumb thickness in px. Default 4. */
  thumbWidth?: number;
  /** Idle delay before the thumb starts fading, in ms. Default 900. */
  hideAfter?: number;
  /** Fade-out duration in ms. Default 500. */
  fade?: number;
  /** Minimum thumb length in px. Default 32. */
  minThumb?: number;
  /**
   * Fade the top and bottom edges to mark content running past them — the top fade only appears once
   * scrolled off the start, the bottom fade disappears at the end. `true` for the default 28px, or a
   * pixel depth.
   */
  edgeFade?: boolean | number;
}
export declare function ScrollArea(props: ScrollAreaProps): JSX.Element;

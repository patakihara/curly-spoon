import { ReactNode } from 'react';

/**
 * The backdrop's front layer: `--surface-bg` at 1dp, holding the primary content and its fixed
 * subheader. `BackdropShell` builds one for you; use it directly only when composing a frame
 * by hand.
 *
 * Its top corners are `--radius-lg` at **every** scroll position. This is the behavioural
 * difference from `ContentPane`, which flattens its corners as you scroll: a backdrop's front
 * layer is a persistent surface, not a sheet that docks. The 1dp step is expressed by a slight
 * `--shadow-sm` lift onto whatever is behind it, and the scroll-linked hairline moves to the
 * subheader, where it is inset to the content measure.
 *
 * The layer owns the scrolling and remembers a scroll offset per `scrollKey`, so switching views
 * and coming back lands where you left. With `scroll={false}` a descendant owns the scroller
 * and the layer tracks it by capture instead.
 */
export interface FrontLayerProps {
  children?: ReactNode;
  /** A `FrontLayerHeader`, fixed above the scrolling content. Cloned with `progress`/`platform`. */
  subheader?: ReactNode;
  /** false when a descendant owns the scrolling (mobile screens) — the layer still tracks it. */
  scroll?: boolean;
  /**
   * Identifier for the view currently rendered inside. Changing it saves the outgoing view's
   * scroll offset, restores the incoming one's (0 for a view not seen yet), and recomputes the
   * subheader's divider state to match — without it, a fresh view inherits the previous scroll
   * position and stays visually "scrolled".
   */
  scrollKey?: string | number;
  /** Fires with 0–1 scroll progress. */
  onProgress?: (progress: number) => void;
  /** Scroll distance in px over which the subheader's divider fades in. Default 24. */
  threshold?: number;
  /** Square the abutting corner where a `sheetLayer="front"` panel meets the layer. */
  squareLeft?: boolean;
  squareRight?: boolean;
  platform?: 'desktop' | 'mobile';
}
export declare function FrontLayer(props: FrontLayerProps): JSX.Element;

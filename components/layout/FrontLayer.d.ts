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
  /**
   * How the 1dp step is expressed. Default `'shadow'` is exactly what the layer has always
   * drawn; the other four exist because that shadow all but vanishes in dark, and picking
   * between them is a judgement about the whole product, not about one screen.
   *
   * The reason it vanishes is geometric before it is chromatic: `--shadow-sm` is `0 1px 3px`,
   * cast *downward*, while the only edge where this layer meets the back layer is its **top**
   * one. Measured off a render, the darkening it puts on the back layer above that boundary is
   * one value out of 255 in dark and at most three in light — neither theme is separated by the
   * shadow, only by the tonal step, `#080808` → `#141414` or `#FFFFFF` → `#F9F6F6`. The light pair
   * differs in hue as well as level and holds; the dark pair sits where a display's black floor
   * flattens it, which is the whole of "no shadow on black".
   *
   * - `'shadow'` — `--shadow-sm`. The control. Correct in light, near-invisible in dark.
   * - `'edge'` — the shadow plus a 1px line along the top edge in `--surface-border`, following
   *   the corner radius so it reads as the layer's edge and not as a rule across it.
   * - `'highlight'` — the same line at roughly twice the strength, from a `color-mix` of
   *   `--surface-fg`: a raised surface catching light from above.
   * - `'glow'` — the same idea unruled, as a soft wash fading out over `--spacing-2xl`.
   * - `'ambient'` — `--shadow-xxl` instead of `--shadow-sm`: the largest, softest,
   *   highest-opacity step the scale has. Included so the shadow family gets its best shot.
   *
   * None of them is gated to dark, so that the light-theme cost stays visible rather than
   * engineered away — `components/layout/backdrop-lift.card.html` shows all five in both themes,
   * with the rendered pixel values `docs/lift_probe.mjs` read back out of it.
   *
   * What that card argues for: **`'edge'`, gated to dark** — light already reads without it, so
   * the gate is the recommendation, not a different treatment. `'highlight'` and `'glow'` must
   * not ship ungated whatever else is decided: both mix `--surface-fg`, which is dark in light
   * theme, so an "inner highlight" inverts into an inner *shadow* there (measured `#D5D2D2` on
   * `#F9F6F6`). Gating is one `[data-theme="light"]` rule, or simply not passing the prop on the
   * light path.
   */
  lift?: 'shadow' | 'edge' | 'highlight' | 'glow' | 'ambient';
  platform?: 'desktop' | 'mobile';
}
export declare function FrontLayer(props: FrontLayerProps): JSX.Element;

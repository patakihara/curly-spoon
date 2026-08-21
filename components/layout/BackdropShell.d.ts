import { ReactNode } from 'react';

/**
 * The app frame as a real Material backdrop.
 *
 * Two surfaces, and only two. The **back layer** is `--surface-bg-alt` at 0dp and fills the
 * entire background: the `rail` is a region of it, not a column beside it, and `back` (a
 * `BackLayer`) is its heading and contextual controls. The **front layer** is `--surface-bg` at
 * 1dp, full width, with permanently rounded top corners and a slight shadow marking the step;
 * `subheader` is fixed to it and `children` scroll underneath.
 *
 * Prop names mirror `AppShell`'s wherever the meaning is the same, so a screen ports by swapping
 * the component and moving its secondary header out of the bar into `subheader`. Unlike
 * `AppShell` there is no `flat`/`square`: the front layer's shape is not scroll-linked and does
 * not flatten for a sub-page.
 *
 * On mobile pass no `rail`, set `platform="mobile"`, and put the bottom nav in `player`.
 */
export interface BackdropShellProps {
  /** Back-layer content — a `BackLayer` with the heading row and any contextual controls. */
  back?: ReactNode;
  /** A `NavRail`. Sits at back-layer level, continuous with it. Omit on mobile. */
  rail?: ReactNode;
  /** The screen itself — scrolls inside the front layer. */
  children?: ReactNode;
  /** A `FrontLayerHeader`. Fixed to the front layer; receives `progress` and `platform` from it. */
  subheader?: ReactNode;
  /**
   * The desktop side panel. With `sheetLayer="front"` pass a `SideSheet` — it draws its own
   * dividers and animates its own width. With `sheetLayer="behind"` pass plain panel content
   * (a title row of `--appbar-height`, then the list): the shell supplies the surface, the
   * open/close width transition and both dividers, because a panel at the lower elevation must
   * not be outlined.
   */
  sheet?: ReactNode;
  /** Whether that panel is open. Squares the front layer's abutting corner in `front` mode only. */
  sheetOpen?: boolean;
  /**
   * Which layer the side panel belongs to. `'front'` (default) puts it above the front layer,
   * full height, with a divider down its whole edge and the front layer squared where they meet.
   * `'behind'` puts it below: both front-layer corners stay rounded, the front layer's shadow
   * falls onto the panel, and the panel's rules shrink to a short one in the heading band and an
   * inset one under it.
   */
  sheetLayer?: 'front' | 'behind';
  /** MiniPlayer, BottomNav, or a fragment of both. Docked across the full width beneath everything. */
  player?: ReactNode;
  /** Floor for the front-layer column, e.g. `var(--content-min-width)`. */
  contentMinWidth?: string;
  /** false when the screen owns its own scrolling (mobile) — the front layer still tracks it. */
  scroll?: boolean;
  /** Identifier of the current view — gives each one its own remembered scroll position. */
  scrollKey?: string | number;
  /** 0–1 scroll progress from the front layer. */
  onProgress?: (progress: number) => void;
  /**
   * Forwarded to the front layer: how its 1dp step is expressed. Omitted, the layer keeps the
   * `--shadow-sm` it has always drawn. The alternatives exist because that shadow is offset
   * downward, away from the layer's top edge, and a black shadow cannot mark a boundary against
   * a `#080808` back layer — see `FrontLayerProps['lift']` for what each value draws and what it
   * costs in light theme.
   */
  lift?: 'shadow' | 'edge' | 'highlight' | 'glow' | 'ambient';
  /** Sets `data-theme` on the frame. */
  theme?: string;
  platform?: 'desktop' | 'mobile';
}
export declare function BackdropShell(props: BackdropShellProps): JSX.Element;

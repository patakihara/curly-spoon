import { ReactNode } from 'react';

/**
 * The front layer's subheader — a fixed area on the front layer, at the same 1dp as the content
 * scrolling below it. This is where a screen's secondary header lives in a backdrop: tabs, a
 * connected `ButtonGroup`, a scoped `SearchField`. It is *not* part of the app bar, and it does
 * not carry the layer's rounding; the front layer does.
 *
 * Its horizontal padding is `--grid-margin`, the page measure, so tabs line up with the section
 * headings beneath them.
 *
 * The divider rule:
 * - `tabs={false}` — a hairline fades in along the bottom edge with scroll progress.
 * - `tabs={true}` — no hairline at all; a tab bar draws its own underline indicator and two
 *   stacked rules are noise.
 * - Either way the hairline is **inset** by the page margin rather than spanning the gutters, so
 *   it reads as the top of the content column instead of cutting the surface in half.
 */
export interface FrontLayerHeaderProps {
  /** A `TabBar`, a `ButtonGroup`, a `SearchField` — whatever the screen's secondary header is. */
  children?: ReactNode;
  /** The content is a tab bar, which draws its own indicator — suppresses the hairline. */
  tabs?: boolean;
  /** 0–1 scroll progress; `FrontLayer` supplies it. Pass it explicitly to show a scrolled state statically. */
  progress?: number;
  platform?: 'desktop' | 'mobile';
}
export declare function FrontLayerHeader(props: FrontLayerHeaderProps): JSX.Element;

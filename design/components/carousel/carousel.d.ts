// Generated from carousel.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A titled, horizontally scrolling row of entries (artwork + title). Activating it opens the item (e.g. the full shelf, a backdrop child).
 *  Extends listItem. */
export interface CarouselProps extends ListItemProps {
  title: string;
  subtitle: string;
  image: string;
  navigable: boolean;
  entries: Slot;
}
export type CarouselState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

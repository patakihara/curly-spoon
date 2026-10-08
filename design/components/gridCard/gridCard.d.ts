// Generated from gridCard.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';

/** One item in a grid. Composition hires it for the item contract, like listRow.
 *  Extends listItem. */
export interface GridCardProps extends ListItemProps {
  title: string;
  subtitle: string;
  image: string;
  navigable: boolean;
  shape: string;
}
export type GridCardState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

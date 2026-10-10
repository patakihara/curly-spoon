// Generated from menuItem.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';

/** One action of a menu: icon + label in a row, the whole row tappable (through its parent listItem's interactive layer).
 *  Variant of listItem: drawn by its implementation. */
export interface MenuItemProps extends ListItemProps {
  text: string;
  icon: string;
}
export type MenuItemState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

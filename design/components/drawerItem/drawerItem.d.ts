// Generated from drawerItem.json by design/build.js — edit the .json, not this file.
import type { NavItemProps } from '../navItem/navItem';

/** A drawer destination: icon + label; the current one has a filled pill.
 *  Variant of navItem: drawn by its implementation. */
export interface DrawerItemProps extends NavItemProps {
  text: string;
  icon: string;
}
export type DrawerItemState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

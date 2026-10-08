// Generated from navItem.json by design/build.js — edit the .json, not this file.
import type { ButtonProps } from '../button/button';

/** One destination in the nav bar or rail. Selecting the active one reselects it: pop to base, or reset by policy at base.
 *  Extends button. */
export interface NavItemProps extends ButtonProps {
  text: string;
  icon: string;
}
export type NavItemState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

// Generated from tab.json by design/build.js — edit the .json, not this file.
import type { ButtonProps } from '../button/button';

/** One tab inside tabBar.
 *  Extends button. */
export interface TabProps extends ButtonProps {
  label: string;
}
export type TabState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

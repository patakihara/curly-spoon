// Generated from button.json by design/build.js — edit the .json, not this file.
import type { InteractiveProps } from '../interactive/interactive';

/** Text action: confirm, dismiss, retry. Pill-shaped.
 *  Extends interactive. */
export interface ButtonProps extends InteractiveProps {
  text: string;
  icon: string;
}
export type ButtonState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

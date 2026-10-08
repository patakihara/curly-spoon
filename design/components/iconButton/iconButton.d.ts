// Generated from iconButton.json by design/build.js — edit the .json, not this file.
import type { InteractiveProps } from '../interactive/interactive';

/** Icon-only action in headers, cards and sheets. Always give it a label: it is the accessible name.
 *  Extends interactive. */
export interface IconButtonProps extends InteractiveProps {
  icon: string;
  label: string;
}
export type IconButtonState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

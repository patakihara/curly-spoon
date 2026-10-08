// Generated from chip.json by design/build.js — edit the .json, not this file.
import type { ButtonProps } from '../button/button';

/** One option inside filterChips.
 *  Extends button. */
export interface ChipProps extends ButtonProps {
  label: string;
}
export type ChipState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

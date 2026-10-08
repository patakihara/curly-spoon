// Generated from logo.json by design/build.js — edit the .json, not this file.
import type { IconButtonProps } from '../iconButton/iconButton';

/** The app mark; opens Dedede. Compact layouts only — on wide layouts the rail has its own entry.
 *  Variant of iconButton: drawn by its implementation. */
export interface LogoProps extends IconButtonProps {
  playing: boolean;
}
export type LogoState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

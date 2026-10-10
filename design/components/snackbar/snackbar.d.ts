// Generated from snackbar.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';

/** Non-blocking message at the bottom. Dismisses itself; never captures back or focus.
 *  Extends surface. */
export interface SnackbarProps extends SurfaceProps {
  text: string;
  action: string;
}
export type SnackbarState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

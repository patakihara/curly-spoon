// Generated from navBar.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** Destinations on compact layouts. Slides away while a sheet layer that hides it is open.
 *  Extends surface. */
export interface NavBarProps extends SurfaceProps {
  destinations: Slot;
  selected: string;
}
export type NavBarState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

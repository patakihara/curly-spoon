// Generated from navRail.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** Wide navigation: decks in the middle; config slots `top` (hamburger, logo) and `bottom` (layer destinations, icon only). When the rail-form drawer layer is open the rail expands to `expandedWidth` (labels beside icons; the drawer page's items) and the content moves aside; it collapses on close or back.
 *  Extends surface. */
export interface NavRailProps extends SurfaceProps {
  destinations: Slot;
  selected: string;
  top: Slot;
  bottom: Slot;
  expanded: boolean;
}
export type NavRailState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

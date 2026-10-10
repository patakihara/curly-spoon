// Generated from sideSheet.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';

/** Wide form of a sheet layer: beside the content when there is room, otherwise modal (touch) or auto-collapsing (pointer).
 *  Extends surface. */
export interface SideSheetProps extends SurfaceProps {
}
export type SideSheetState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

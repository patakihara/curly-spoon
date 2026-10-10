// Generated from menu.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** Overlay menu (OverlaySpec kind menu): a short list of actions — each item { label, icon, action }; picking one runs it and closes the menu. Back or a tap outside closes it.
 *  Extends surface. */
export interface MenuProps extends SurfaceProps {
  items: Slot;
  openedAt: ParamValue;
}
export type MenuState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

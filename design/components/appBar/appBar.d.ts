// Generated from appBar.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** The surface of an app-bar page: a 56px bar with back, title and actions, over full-screen content. Light surface: dark content.
 *  Extends surface. */
export interface AppBarProps extends SurfaceProps {
  start: Slot;
  title: Slot;
  end: Slot;
  expanded: Slot;
  fab: Slot;
  progress: number;
  bottom: Slot;
}
export type AppBarState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

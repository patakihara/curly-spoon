// Generated from frontLayer.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** The backdrop's content surface, one per backdrop page. Its top edge follows the back layer: expanded, partly collapsed (scrim) or fully collapsed (header only). Not interactive itself; its header and items are.
 *  Extends surface. */
export interface FrontLayerProps extends SurfaceProps {
  position: string;
  header: Slot;
  content: Slot;
}
export type FrontLayerState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus' | 'expanded' | 'partlyCollapsed' | 'fullyCollapsed';

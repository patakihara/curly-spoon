// Generated from frontLayer.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** The backdrop's content surface, one per backdrop page. Its top edge follows the back layer: expanded, partly collapsed (scrim) or fully collapsed (header only). Not interactive itself; its header and items are. */
export interface FrontLayerProps {
  position: string;
  header: Slot;
  content: Slot;
}
export type FrontLayerState = 'expanded' | 'partlyCollapsed' | 'fullyCollapsed';

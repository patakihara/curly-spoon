// Generated from backLayer.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** The backdrop's control surface behind the front layer: header, actions, its controls rows (shown concealed too) and its panel (shown only revealed; it scrolls when taller than the room above the front layer's header, and holds an open More alone). Takes the deck's palette. Tapping it anywhere that isn't another interactive element toggles it (expand ⇄ conceal); no hover or press feedback — the motion is the feedback. Its header can slide away while the front layer scrolls (hideOnScroll).
 *  Extends surface. */
export interface BackLayerProps extends SurfaceProps {
  palette: string;
  expanded: boolean;
  headerHidden: boolean;
  regions: unknown;
  header: Slot;
  actions: Slot;
  controls: Slot;
  panel: Slot;
  more: Slot;
}
export type BackLayerState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

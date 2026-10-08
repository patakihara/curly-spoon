// Generated from fullscreenLayer.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A fullscreen layer (role `fullscreenLayer`, `FullscreenPresentation`): its page covers the content (and the navigation where `coversNav` says so). Supplied: open. Its page draws itself (an app-bar page); the layer has no look of its own yet. */
export interface FullscreenLayerProps {
  open: boolean;
  page: Slot;
}

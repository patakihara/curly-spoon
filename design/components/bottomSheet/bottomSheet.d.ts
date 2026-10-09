// Generated from bottomSheet.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A sheet rising from the bottom (compact Now playing; the Up next sheet inside the player page). Its top corners are `cornerTop`; it clips its content to that shape (`clip`), so state layers of components placed edge to edge on it (the handle / tab row) follow the corners. */
export interface BottomSheetProps {
  expanded: boolean;
  paramControl: Slot;
  content: Slot;
}

// Generated from morph.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** Two children, one shown: `from` while `morphed` is false, `to` while true. Switching animates a container morph — the shown child's bounds and corner radius grow / shrink into the other's while their contents fade through. `span: header` lets `to` take the whole bar except its last item (the caret). Sample: local search — an icon that becomes the field. */
export interface MorphProps {
  morphed: boolean;
  from: Slot;
  to: Slot;
}

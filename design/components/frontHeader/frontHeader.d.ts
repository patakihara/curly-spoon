// Generated from frontHeader.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** The front layer's header (role `frontHeader`): always shown, starts with the caret. Its `fab` slot puts a FAB on the edge between the header and the content, centred under the last end item. */
export interface FrontHeaderProps {
  start: Slot;
  title: Slot;
  end: Slot;
  fab: Slot;
}

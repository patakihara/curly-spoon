// Generated from header.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A bar: start items, a title, end items (role `bar`, also `peek`). With an `expanded` slot the bar is taller at the top of the content and collapses as it scrolls (supplied `progress` 0 → 1); the expanded content fades and scales down and the title fades in. */
export interface HeaderProps {
  start: Slot;
  title: Slot;
  end: Slot;
  expanded: Slot;
  progress: number;
}

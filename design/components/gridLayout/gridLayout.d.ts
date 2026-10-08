// Generated from gridLayout.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** Responsive grid: as many columns as fit at minColumnWidth (at most maxColumns), each stretching to fill the row; items keep itemAspect (width / height). Platforms compute the columns from the width they have (web: repeat(auto-fill, minmax(min, 1fr)); Android: adaptive lazy grid). */
export interface GridLayoutProps {
  groups: unknown;
  items: Slot;
  state: Slot;
  banner: Slot;
}

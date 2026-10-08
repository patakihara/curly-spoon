// Generated from sheetLayer.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A sheet layer (role `sheetLayer`, `SheetPresentation`): compact as a bottom sheet (surface `bottomSheet`), wide as a side sheet (surface `sideSheet`); collapsed it shows its peek (compact: above the nav bar; wide: a floating card, surface `peekCard`). Supplied: open, form (bottomSheet | sideSheet), side (beside | modal | auto). Emits open (peek tap) and close. */
export interface SheetLayerProps {
  open: boolean;
  form: string;
  side: string;
  peek: Slot;
  page: Slot;
}

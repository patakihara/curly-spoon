// Generated from backLayer.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** The backdrop's control surface behind the front layer: header, actions, param-control rows (the 'always' ones shown concealed too, the rest in its panel). Takes the deck's palette. Tapping it anywhere that isn't another interactive element toggles it (expand ⇄ conceal); no hover or press feedback — the motion is the feedback. Its header can slide away while the front layer scrolls (hideOnScroll). */
export interface BackLayerProps {
  palette: string;
  expanded: boolean;
  headerHidden: boolean;
  header: Slot;
  actions: Slot;
  paramControls: Slot;
  more: Slot;
}

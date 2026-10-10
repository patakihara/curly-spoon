// Generated from morePanel.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A control's More, in the back layer's panel: a bar with a close button (✕) and the title (its param's label), over its content (the More's control rows). Pressing ✕ sends `close`. While its rows scroll the bar stays at the top (`pinned`), on its own `fill`. */
export interface MorePanelProps {
  title: string;
  closeLabel: string;
  content: Slot;
}

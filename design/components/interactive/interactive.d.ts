// Generated from interactive.json by design/build.js — edit the .json, not this file.

/** Abstract base of every interactive component: the six states, state layer, ripple, focus ring and disabled / busy opacity, plus the motions for every state transition (state layer and focus ring fade, press ripples, a slight press scale). Components extend it and store only what differs. Platforms draw it with one shared helper (web: `interactive.js`). Large surfaces (listItem and its children: rows, cards, header overlays) keep scale 1 when pressed, so the ink fills them edge to edge. */
export interface InteractiveProps {
}
export type InteractiveState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

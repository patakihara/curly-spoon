// Generated from backdropPage.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** A backdrop page (role `backdropPage`): its back layer (`backLayer`) behind its front layer (`frontLayer`). Parts come from the page config (`back`, `front`); the page has no look of its own — its surfaces do. */
export interface BackdropPageProps {
  back: Slot;
  front: Slot;
}

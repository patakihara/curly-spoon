// Generated from drawer.json by design/build.js — edit the .json, not this file.
export type Slot = unknown;   // a ComponentRef list (api.d.ts §1)

/** Surface of a drawer layer (`DrawerPresentation`): a title row and `drawerItem` rows. Slides in from the start edge over a scrim (`scrim`). On wide layouts with `wide: 'rail'` the navigation rail expands instead. */
export interface DrawerProps {
  open: boolean;
  form: string;
  page: Slot;
}

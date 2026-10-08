// Generated from fab.json by design/build.js — edit the .json, not this file.
import type { InteractiveProps } from '../interactive/interactive';

/** Circular floating action button (40px; lg 64px on the Now playing page). In a header / app bar `fab` slot it sits centred on the bottom edge, under the search icon. A header holding a FAB grows by `size.fab.edge` (20px) at its bottom; without one it keeps its normal height. Several refs with exclusive `when`s share one place: the icon morphs between them (play → play next → add to queue).
 *  Extends interactive. */
export interface FabProps extends InteractiveProps {
  icon: string;
  label: string;
}
export type FabState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

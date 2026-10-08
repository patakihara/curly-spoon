// Generated from listRow.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';

/** One item in a list. Composition hires it for the item contract: its values (title, subtitle, navigable) come from the engine, and it opens the item. Rows that open nothing render disabled.
 *  Extends listItem. */
export interface ListRowProps extends ListItemProps {
  title: string;
  subtitle: string;
  image: string;
  navigable: boolean;
  shape: string;
}
export type ListRowState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

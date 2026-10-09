// Generated from checkRow.json by design/build.js — edit the .json, not this file.
import type { ListItemProps } from '../listItem/listItem';

/** One option of a checklist: its label, and a check at the end while it is selected.
 *  Variant of listItem: drawn by its implementation. */
export interface CheckRowProps extends ListItemProps {
  text: string;
  selected: boolean;
}
export type CheckRowState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

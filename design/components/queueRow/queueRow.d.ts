// Generated from queueRow.json by design/build.js — edit the .json, not this file.
import type { ListRowProps } from '../listRow/listRow';

/** An Up next entry: art, title, subtitle, drag handle. The current track has a tinted fill and a playing indicator over its art.
 *  Variant of listRow: drawn by its implementation. */
export interface QueueRowProps extends ListRowProps {
  current: boolean;
}
export type QueueRowState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

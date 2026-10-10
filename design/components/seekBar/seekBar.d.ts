// Generated from seekBar.json by design/build.js — edit the .json, not this file.
import type { InteractiveProps } from '../interactive/interactive';
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** Track position with elapsed / total times. Bound to player state (`bind: { player: positionMs }`): dragging seeks.
 *  Extends interactive. */
export interface SeekBarProps extends InteractiveProps {
  value: ParamValue;
  options: { value: string; label: string }[];
  durationMs: number;
  label: string;
}
export type SeekBarState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

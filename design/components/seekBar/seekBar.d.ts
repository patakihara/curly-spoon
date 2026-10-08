// Generated from seekBar.json by design/build.js — edit the .json, not this file.
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** Track position with elapsed / total times. Bound to player state (`bind: { player: positionMs }`): dragging seeks. */
export interface SeekBarProps {
  value: ParamValue;
  options: { value: string; label: string }[];
  durationMs: number;
  label: string;
}

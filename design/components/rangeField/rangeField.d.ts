// Generated from rangeField.json by design/build.js — edit the .json, not this file.
import type { InteractiveProps } from '../interactive/interactive';
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** Two number fields (from – to) for a number range param, clamped to the param's min / max. Commits on blur / enter.
 *  Extends interactive. */
export interface RangeFieldProps extends InteractiveProps {
  value: ParamValue;
  options: { value: string; label: string }[];
  fromLabel: string;
  toLabel: string;
  min: number;
  max: number;
}
export type RangeFieldState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

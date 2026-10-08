// Generated from dropdown.json by design/build.js — edit the .json, not this file.
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** One-of choice as a menu button (label + current option + chevron). Opens the options in a menu anchored to it. */
export interface DropdownProps {
  value: ParamValue;
  options: { value: string; label: string }[];
  label: string;
}

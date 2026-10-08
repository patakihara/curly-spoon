// Generated from filterChips.json by design/build.js — edit the .json, not this file.
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** A control for a choices param: one chip per option, each toggling. Composition hires it for input contracts on a choices param; value and options come from the engine. */
export interface FilterChipsProps {
  value: ParamValue;
  options: { value: string; label: string }[];
}

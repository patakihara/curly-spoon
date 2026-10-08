// Generated from tabBar.json by design/build.js — edit the .json, not this file.
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** A control for a choice param: equal-width tabs (one per option) with a sliding indicator. Composition hires it for input contracts on a choice param; value and options come from the engine. */
export interface TabBarProps {
  value: ParamValue;
  options: { value: string; label: string }[];
}

// Generated from checklist.json by design/build.js — edit the .json, not this file.
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** A control showing every option of a choice or choices param as a list, one checkRow per option, top to bottom; the selected ones carry a check. For a choices param pressing a row sends `toggle` with its value; for a choice param `change`. Used where a long list fits (a More). */
export interface ChecklistProps {
  value: ParamValue;
  options: { value: string; label: string }[];
}

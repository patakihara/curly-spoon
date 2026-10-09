// Generated from suggestionList.json by design/build.js — edit the .json, not this file.
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** A control for a text param that offers choices (search predictions, popular searches): one suggestionRow per option, top to bottom. Picking one sends `pick` with its value; composition sets the param to it and applies it at once. */
export interface SuggestionListProps {
  value: ParamValue;
  options: { value: string; label: string }[];
}

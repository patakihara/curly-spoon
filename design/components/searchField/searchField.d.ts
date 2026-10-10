// Generated from searchField.json by design/build.js — edit the .json, not this file.
import type { InteractiveProps } from '../interactive/interactive';
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** A control for a text param: one text field with a clear button. Composition hires it for input / find contracts on a text param; value comes from the engine, placeholder from the config. Bind { change, submit } to keep a draft (predictions) apart from the submitted query.
 *  Extends interactive. */
export interface SearchFieldProps extends InteractiveProps {
  value: ParamValue;
  options: { value: string; label: string }[];
  placeholder: string;
  clearLabel: string;
}
export type SearchFieldState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

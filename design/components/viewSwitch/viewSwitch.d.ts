// Generated from viewSwitch.json by design/build.js — edit the .json, not this file.
import type { IconButtonProps } from '../iconButton/iconButton';
export type ParamValue = string | string[] | boolean | number | [number, number] | [string, string] | null;   // api.d.ts §1

/** An icon button bound to a choice param (e.g. the presentation): each tap moves to the next option. Icon and label come from the config (usually conditions on the param). Drawn by iconButton.
 *  Variant of iconButton: drawn by its implementation. */
export interface ViewSwitchProps extends IconButtonProps {
  value: ParamValue;
  options: { value: string; label: string }[];
}
export type ViewSwitchState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

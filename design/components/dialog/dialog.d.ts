// Generated from dialog.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';

/** Blocking overlay. Traps focus; back closes it before anything else. Use for a decision, with at most two actions.
 *  Extends surface. */
export interface DialogProps extends SurfaceProps {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  confirmLabel: string;
  cancelLabel: string;
}
export type DialogState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

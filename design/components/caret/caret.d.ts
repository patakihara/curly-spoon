// Generated from caret.json by design/build.js — edit the .json, not this file.
import type { IconButtonProps } from '../iconButton/iconButton';

/** The back layer header's disclosure control, always at the right of the header. Composition hires it for the back header's disclosure button: the engine supplies expanded and toggles the back layer. Points down while the back layer is concealed and turns over as it expands, with the back layer's own timing. Drawn by the icon button.
 *  Variant of iconButton: drawn by its implementation. */
export interface CaretProps extends IconButtonProps {
  expanded: boolean;
}
export type CaretState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

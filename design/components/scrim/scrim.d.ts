// Generated from scrim.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';

/** The veil over what a layer covers while something sits above it; tapping it sends the layer's own tap (the front layer's: collapse the back layer).
 *  Extends surface. */
export interface ScrimProps extends SurfaceProps {
}
export type ScrimState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

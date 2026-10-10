// Generated from peekCard.json by design/build.js — edit the .json, not this file.
import type { SurfaceProps } from '../surface/surface';

/** A collapsed sheet layer on wide layouts: a floating card centred on the content, at most 500px wide.
 *  Extends surface. */
export interface PeekCardProps extends SurfaceProps {
  title: string;
  subtitle: string;
}
export type PeekCardState = 'enabled' | 'disabled' | 'hover' | 'pressed' | 'focus' | 'keyboardFocus';

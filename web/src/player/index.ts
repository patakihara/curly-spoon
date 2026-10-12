import { placeholder, type Loaded } from '../generated/nav/playing';

/**
 * The web's player, as the generated pages and shell bind it: `usePlaying()` is what is loaded,
 * in the canvas's shape, with its transport, or null while nothing is; `usePlay()` hands the
 * handler that starts an item. A handler left out draws its control disabled, as a Sonora control
 * with no action does. Until the player store (M1.shell, Part 7) fills them, what is loaded is
 * the canvas's picture of it, with no transport, and nothing plays.
 */

/** The queue an item plays on. */
export type PlayQueue = 'spoken' | 'music';

/** How it plays: now, next in the queue, or a list played on its own. */
export type PlayMode = 'now' | 'next' | 'source';

/** The handler that plays the item `ref` names on `queue`, as `mode` says; none while it cannot. */
export type Play = (ref: string, queue: PlayQueue, mode: PlayMode) => (() => void) | undefined;

/** What is loaded and its transport, the mini-player's and Now Playing's handlers by name. */
export interface Playing extends Loaded {
  /** Whether it plays, rather than sits paused. */
  playing: boolean;
  /** The playback rate, 1, 1.25, 1.5 … */
  speed: number;
  onTogglePlay?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  /** Seeks to `value`, 0-1 of what is loaded. */
  onSeek?: (value: number) => void;
  onSpeed?: () => void;
  onSleep?: () => void;
}

const LOADED: Playing = { ...placeholder, playing: true, speed: 1 };

/** What is loaded, or null while nothing is. */
export function usePlaying(): Playing | null {
  return LOADED;
}

const cannotPlay: Play = () => undefined;

/** The player's Play. */
export function usePlay(): Play {
  return cannotPlay;
}

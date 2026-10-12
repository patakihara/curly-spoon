import { placeholder, type Loaded } from '../generated/nav/playing';

/**
 * The web's player, as the generated pages and shell bind it: `usePlaying()` is what is loaded,
 * in the canvas's shape, with its transport, or null while nothing is; `usePlay()` starts an
 * item. Until the player store (M1.shell, Part 7) fills them, what is loaded is the canvas's
 * picture of it and the transport and Play do nothing.
 */

/** The queue an item plays on. */
export type PlayQueue = 'spoken' | 'music';

/** How it plays: now, next in the queue, or a list played on its own. */
export type PlayMode = 'now' | 'next' | 'source';

/** What is loaded and its transport, the mini-player's and Now Playing's handlers by name. */
export interface Playing extends Loaded {
  /** Whether it plays, rather than sits paused. */
  playing: boolean;
  /** The playback rate, 1, 1.25, 1.5 … */
  speed: number;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  /** Seeks to `value`, 0-1 of what is loaded. */
  onSeek: (value: number) => void;
  onSpeed: () => void;
  onSleep: () => void;
}

const idle = () => {};

const LOADED: Playing = {
  ...placeholder,
  playing: true,
  speed: 1,
  onTogglePlay: idle,
  onPrev: idle,
  onNext: idle,
  onSkipBack: idle,
  onSkipForward: idle,
  onSeek: idle,
  onSpeed: idle,
  onSleep: idle,
};

/** What is loaded, or null while nothing is. */
export function usePlaying(): Playing | null {
  return LOADED;
}

/** Plays the item `ref` names on `queue`, as `mode` says. */
export function usePlay(): (ref: string, queue: PlayQueue, mode: PlayMode) => void {
  return idle;
}

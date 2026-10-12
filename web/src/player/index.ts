import { parseMediaRefKey } from '@auralis/schema';
import { useMemo, useSyncExternalStore } from 'react';
import { placeholder, type Loaded } from '../generated/nav/playing';
import { SKIP_SECONDS } from './media-session';
import { createPlayerStore, type PlayerState, type PlayerStore } from './store';

/**
 * The web's player, as the generated pages and shell bind it: `usePlaying()` is what is loaded,
 * in the canvas's shape, with its transport; `usePlay()` hands the handler that starts an item.
 * Both read one player store (`store.ts`). A handler left out draws its control disabled, as a
 * Sonora control with no action does: a book or an episode skips and changes speed, music steps
 * to the previous or next track. While nothing is loaded it still shows the canvas's picture,
 * with no transport, as every page still shows its canvas placeholder (M1.shell, Part 8 gives the
 * pages their data and shows nothing loaded as nothing).
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

/** Nothing loaded: the canvas's picture, its transport disabled. */
const IDLE: Playing = { ...placeholder, playing: true, speed: 1 };

/** What is played knows no artist page yet: its about card is empty. */
const NO_ABOUT: Loaded['about'] = { title: '', heading: '', meta: '', image: '', body: '' };

type Transport = Required<
  Pick<
    Playing,
    | 'onTogglePlay'
    | 'onPrev'
    | 'onNext'
    | 'onSkipBack'
    | 'onSkipForward'
    | 'onSeek'
    | 'onSpeed'
    | 'onSleep'
  >
>;

const transports = new WeakMap<PlayerStore, Transport>();

/** One store's handlers, made once, so a control keeps the same one across renders. */
const transportOf = (store: PlayerStore): Transport => {
  let made = transports.get(store);
  if (made === undefined) {
    made = {
      onTogglePlay: () => void (store.getState().playing ? store.pause() : store.resume()),
      onPrev: () => void store.step('back'),
      onNext: () => void store.step('next'),
      onSkipBack: () => void store.skip(-SKIP_SECONDS),
      onSkipForward: () => void store.skip(SKIP_SECONDS),
      onSeek: (value) => void store.seek(value * store.getState().duration),
      onSpeed: () => store.cycleSpeed(),
      onSleep: () => store.cycleSleep(),
    };
    transports.set(store, made);
  }
  return made;
};

/** What `state` shows, in the canvas's shape, with the controls its variant has. */
export function playingOf(state: PlayerState, store: PlayerStore): Playing {
  const { plan } = state;
  if (plan === null) return IDLE;
  const t = transportOf(store);
  const spoken = plan.meta.variant === 'spoken';
  return {
    title: plan.meta.title,
    artist: plan.meta.sub ?? '',
    image: plan.meta.art ?? '',
    context: '',
    variant: plan.meta.variant,
    favourite: false,
    progress: state.duration > 0 ? Math.min(state.position / state.duration, 1) : 0,
    duration: state.duration,
    sleep: state.sleep,
    about: NO_ABOUT,
    playing: state.playing,
    speed: state.speed,
    onTogglePlay: t.onTogglePlay,
    onSeek: t.onSeek,
    onSleep: t.onSleep,
    ...(spoken
      ? { onSkipBack: t.onSkipBack, onSkipForward: t.onSkipForward, onSpeed: t.onSpeed }
      : { onPrev: t.onPrev, onNext: t.onNext }),
  };
}

/** `store`'s Play: a ref that names no playable item gets no handler, so its Play stays disabled. */
export function playOf(store: PlayerStore): Play {
  return (ref, queue, mode) => {
    const item = parseMediaRefKey(ref);
    if (item === null) return undefined;
    return mode === 'next' ? () => void store.queueNext(item, queue) : () => void store.play(item);
  };
}

let shared: PlayerStore | null = null;

/** The page's one player store, made when first read. */
export const playerStore = (): PlayerStore => (shared ??= createPlayerStore());

/** What is loaded, with its transport. */
export function usePlaying(): Playing | null {
  const store = playerStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return useMemo(() => playingOf(state, store), [state, store]);
}

/** The player's Play. */
export function usePlay(): Play {
  const store = playerStore();
  return useMemo(() => playOf(store), [store]);
}

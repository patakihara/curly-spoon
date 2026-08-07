/**
 * An explicit, ordered play-list for music — decoupled from the cumulative-`startOffset`
 * timeline `queue.ts`'s `albumQueue` lays tracks out on, which is what actually makes
 * shuffle, repeat and a queue spanning more than one browse page possible. `queue.ts`'s own
 * header (written when this wave's gap was first identified) already names the fix: "an
 * explicit ordered play-list decoupled from `startOffset`, not a bigger version of this."
 * This module is that play-list.
 *
 * `MusicQueueState.order` is the canonical, never-reordered track list — it only ever grows
 * (`appendTracks`, when the queue advances past what's loaded so far) and is never itself
 * shuffled. `positions` is a permutation of `order`'s indices describing *play order*:
 * shuffling only ever rewrites `positions`, so restoring the identity permutation always
 * recovers the exact original order, including tracks already played — nothing in `order`
 * is ever touched by a shuffle. `cursor` is where in `positions` playback currently is.
 *
 * `materialize` produces the identical cumulative-`startOffset` layout `queue.ts`'s
 * `albumQueue` already builds for a plain, unshuffled page, generalized to walk `positions`
 * order instead of array order. The player itself (`playback.ts`'s `trackAt`/`nextTrack`,
 * `useAudioElement.ts`) never has to know a queue was shuffled at all — both are just an
 * `AudioTrack[]` laid out end to end, and the only integration point is
 * `features/music/musicQueueController.ts`'s `handleTrackEnded`, which this module's
 * `advance` drives. That reuse is exactly why the audiobook/podcast path is unaffected:
 * nothing about how a *single* loaded segment plays changed, only what segment gets loaded
 * and when — see `musicQueueController.ts`'s own header for the mechanism.
 */
import type { AudioTrack } from '../../api/types.js';

export interface QueueTrack {
  id: string;
  title: string;
  durationSeconds: number | null;
  /**
   * This track's own artist, pre-joined (`", "`-separated, matching the convention
   * `MusicAlbumPage.tsx`/`MusicPlaylistPage.tsx` already use for `JellyfinTrack.artistNames`) —
   * `null` when Jellyfin never populated `artistNames` for this track, never `''` (an empty
   * join result is normalized to `null` in `toQueueTrack` so a falsy-check-based fallback,
   * e.g. `track.artist || albumArtist`, can't be defeated by a defined-but-blank string).
   * Optional so every pre-existing `QueueTrack` literal in this module's own tests keeps
   * typechecking without an update — `materialize` treats a missing value the same as `null`.
   */
  artist?: string | null;
}

export type RepeatMode = 'off' | 'one' | 'all';

export interface MusicQueueState {
  /** Canonical, upstream-order track list. Grows via `appendTracks`; a track's position
   *  here is its permanent identity for `positions` below and never changes once added. */
  order: QueueTrack[];
  /** Upstream's real total count for this queue's source (an album or playlist) — distinct
   *  from `order.length`, which is only how many are loaded so far. */
  total: number;
  /** A permutation of `order`'s indices describing play order. Identity (`[0, 1, 2, ...]`)
   *  when not shuffled. */
  positions: number[];
  /** Index into `positions` of the currently playing track. */
  cursor: number;
  shuffled: boolean;
  repeat: RepeatMode;
}

export type AdvanceResult =
  | { kind: 'track'; state: MusicQueueState; track: QueueTrack }
  /** More of `order` exists upstream (`order.length < total`) than is loaded — the caller's
   *  cue to fetch the rest and call `advance` again once `appendTracks` has grown `order`. */
  | { kind: 'needsFetch' }
  /** Nothing plays next — repeat is off and every loaded (and, per `total`, every upstream)
   *  track has already been visited. Mirrors `useAudioElement.ts`'s original "nothing left
   *  on the timeline — pause" outcome for a book. */
  | { kind: 'none' };

/** `JellyfinTrack` and `JellyfinPlaylistItem.track` both already carry every field this
 *  needs — a small adapter so the album/playlist pages don't need to know this module's own
 *  shape, and so this module doesn't need to import either upstream type.
 *
 *  `artistNames.join(', ')` degrades to `''` for a track with no artists at all — normalized
 *  to `null` here (rather than left as `''`) so a downstream `track.artist || <fallback>`
 *  check (`playerUi.ts`'s `playerDisplayMeta`) actually falls back instead of "succeeding"
 *  with a blank artist line, which would be worse than the album-artist bug this exists to
 *  fix. */
export function toQueueTrack(track: {
  id: string;
  name: string;
  durationSeconds: number | null;
  artistNames: string[];
}): QueueTrack {
  const artist = track.artistNames.join(', ');
  return {
    id: track.id,
    title: track.name,
    durationSeconds: track.durationSeconds,
    artist: artist === '' ? null : artist,
  };
}

/**
 * `startIndex` is clamped into range rather than trusted — degrade, don't throw, same as
 * everywhere else in this app. An out-of-range value (e.g. a stale row racing a page change,
 * the same race `MusicAlbumPage.tsx`'s own doc comment already calls out) starts the queue
 * at its own beginning instead of producing an invalid cursor.
 */
export function createQueue(
  tracks: QueueTrack[],
  total: number,
  startIndex: number,
): MusicQueueState {
  const cursor = tracks.length === 0 ? 0 : Math.min(Math.max(startIndex, 0), tracks.length - 1);
  return {
    order: tracks,
    total,
    positions: tracks.map((_, i) => i),
    cursor,
    shuffled: false,
    repeat: 'off',
  };
}

/** The track currently at the play head, or `undefined` for a queue with nothing loaded. */
export function currentTrack(state: MusicQueueState): QueueTrack | undefined {
  const originalIndex = state.positions[state.cursor];
  return originalIndex === undefined ? undefined : state.order[originalIndex];
}

/**
 * Fisher–Yates, not `sort(() => Math.random() - 0.5)` — the latter is a well-known wrong
 * answer (its distribution is neither uniform nor even well-defined, since `Array.sort`'s
 * comparator contract doesn't require every pair to be compared). This is the real thing:
 * each element is swapped with a uniformly random earlier-or-equal one, walking from the end.
 */
function fisherYates(values: number[], random: () => number): number[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue; // unreachable; keeps this total.
    result[i] = b;
    result[j] = a;
  }
  return result;
}

/**
 * Reorders only what plays *after* the current track — `positions[0..cursor]` (history +
 * now playing) is left untouched, both because the spec requires the current track to
 * survive a shuffle toggle unchanged, and because rewriting history would leave "unshuffle"
 * unable to tell which of several equal-looking past tracks was the one actually current.
 * Idempotent: shuffling an already-shuffled queue, or unshuffling an already-unshuffled one,
 * returns `state` unchanged rather than reshuffling (or no-op-reshuffling) again on a
 * duplicate toggle.
 */
export function setShuffled(
  state: MusicQueueState,
  shuffled: boolean,
  random: () => number = Math.random,
): MusicQueueState {
  if (shuffled === state.shuffled) return state;
  if (!shuffled) {
    // Restore the exact original order, including tracks already passed — `order` was never
    // touched by shuffling, so the identity permutation alone recovers it. The cursor moves
    // to wherever the current track's original index now sits (which, in the identity
    // permutation, is that index itself), so "unshuffle" still doesn't change what's playing.
    const originalIndex = state.positions[state.cursor];
    return {
      ...state,
      positions: state.order.map((_, i) => i),
      cursor: originalIndex ?? state.cursor,
      shuffled: false,
    };
  }
  const head = state.positions.slice(0, state.cursor + 1);
  const tail = fisherYates(state.positions.slice(state.cursor + 1), random);
  return { ...state, positions: [...head, ...tail], shuffled: true };
}

export function setRepeatMode(state: MusicQueueState, repeat: RepeatMode): MusicQueueState {
  return repeat === state.repeat ? state : { ...state, repeat };
}

/** Off → all → one → off — the cycle the repeat control's single click walks. `all` before
 *  `one` matches the common convention (Spotify, YouTube Music, both cited references for
 *  this app) of reaching "repeat the whole queue" before "repeat just this track". */
const REPEAT_CYCLE: readonly RepeatMode[] = ['off', 'all', 'one'];

export function nextRepeatMode(current: RepeatMode): RepeatMode {
  const index = REPEAT_CYCLE.indexOf(current);
  const nextIndex = (index === -1 ? 0 : index + 1) % REPEAT_CYCLE.length;
  // `REPEAT_CYCLE` is non-empty and `nextIndex` is always in range; the fallback keeps this
  // total rather than asserting non-null against `noUncheckedIndexedAccess`.
  return REPEAT_CYCLE[nextIndex] ?? 'off';
}

/**
 * Adds freshly fetched tracks to the end of the canonical order and to the end of the
 * current play order — a cross-page fetch always arrives in upstream (album/playlist) order
 * and is appended after whatever's already queued, never spliced into an in-progress
 * shuffle's already-decided upcoming order.
 */
export function appendTracks(state: MusicQueueState, tracks: QueueTrack[]): MusicQueueState {
  if (tracks.length === 0) return state;
  const startIndex = state.order.length;
  const newIndices = tracks.map((_, i) => startIndex + i);
  return {
    ...state,
    order: [...state.order, ...tracks],
    positions: [...state.positions, ...newIndices],
  };
}

/**
 * Inserts a track that isn't part of this queue's own source (an album/playlist context
 * menu's "Play next"/"Play last") — distinct from `appendTracks`, which only ever grows a
 * queue with *more of the same source* fetched lazily as playback advances past what's
 * loaded so far. `total` is bumped by one here, unlike `appendTracks`: `total` is read in
 * exactly one place (`advance`'s `order.length < state.total` check, "is there more of this
 * source upstream to fetch"), and if an ad-hoc insert left it unchanged, `order.length` could
 * reach `total` while the source itself still has unfetched tracks — silently truncating the
 * source's remainder into a false "nothing left" the next time `advance` runs off the end.
 * Bumping `total` alongside `order` keeps that check meaning what it always meant.
 *
 * Never called on a `null` queue (nothing to insert into) — see `TrackContextMenu.tsx`'s own
 * doc comment for why "start a fresh queue from a context-menu action" was rejected instead.
 */
function insertTrack(state: MusicQueueState, track: QueueTrack, at: number): MusicQueueState {
  const newIndex = state.order.length;
  const positions = [...state.positions];
  positions.splice(at, 0, newIndex);
  return { ...state, order: [...state.order, track], positions, total: state.total + 1 };
}

/** "Play next" — inserts immediately after the currently playing track, i.e. at
 *  `positions[cursor + 1]`, so it plays as soon as the current track ends without disturbing
 *  anything already queued after it. */
export function insertTrackNext(state: MusicQueueState, track: QueueTrack): MusicQueueState {
  return insertTrack(state, track, state.cursor + 1);
}

/** "Play last" — appended to the very end of `positions`, playing after everything else
 *  currently queued (including anything a previous "Play next" already inserted). */
export function insertTrackLast(state: MusicQueueState, track: QueueTrack): MusicQueueState {
  return insertTrack(state, track, state.positions.length);
}

/**
 * What plays after the current track ends, given `state.repeat`/`state.shuffled` — the pure
 * decision `musicQueueController.ts`'s `handleTrackEnded` acts on. Never mutates `state` in
 * place and never fetches; see `AdvanceResult`'s own doc comment for `'needsFetch'`/`'none'`.
 *
 * `repeat: 'one'` short-circuits everything else: it always returns the current track again,
 * with `state` unchanged (no cursor movement) — this is what lets `musicQueueController.ts`
 * restart the same track without touching queue order at all.
 *
 * Reaching the end of `positions` wraps only for `repeat: 'all'`, and only once `order` is
 * known to hold everything upstream (`order.length >= total`) — wrapping earlier would loop
 * through a partial queue and skip tracks nothing has fetched yet. A shuffled wrap reshuffles
 * the whole queue fresh for the new cycle (matching the common "reshuffle each loop"
 * behaviour of the cited reference apps) rather than replaying the same shuffled order every
 * time — nothing in this wave's spec requires it, but repeating one fixed "random" order
 * forever reads as an obvious pattern the moment it repeats.
 */
export function advance(state: MusicQueueState, random: () => number = Math.random): AdvanceResult {
  if (state.repeat === 'one') {
    const track = currentTrack(state);
    return track ? { kind: 'track', state, track } : { kind: 'none' };
  }
  const nextCursor = state.cursor + 1;
  if (nextCursor < state.positions.length) {
    const originalIndex = state.positions[nextCursor];
    const track = originalIndex === undefined ? undefined : state.order[originalIndex];
    if (!track) return { kind: 'none' };
    return { kind: 'track', state: { ...state, cursor: nextCursor }, track };
  }
  if (state.order.length < state.total) return { kind: 'needsFetch' };
  if (state.repeat === 'all') {
    const positions = state.shuffled
      ? fisherYates(
          state.order.map((_, i) => i),
          random,
        )
      : state.order.map((_, i) => i);
    const track = state.order[positions[0] ?? -1];
    if (!track) return { kind: 'none' };
    return { kind: 'track', state: { ...state, positions, cursor: 0 }, track };
  }
  return { kind: 'none' };
}

/**
 * Lays the queue's current play order out end to end on one cumulative timeline — the same
 * arithmetic `queue.ts`'s `albumQueue` uses for a plain, unshuffled page, generalized to walk
 * `positions` order instead of array order. Same zero-duration degrade as `albumQueue` for a
 * track with an unknown `durationSeconds`, for the same reason: a track with no known length
 * still plays, it just can't contribute an accurate `startOffset` to anything after it.
 *
 * The resulting array's own index always equals the `positions` index it came from, which is
 * what lets `musicQueueController.ts` read `audioTracks[state.cursor]` directly for "the
 * `AudioTrack` that's now current" after every `advance`, without a second search.
 */
export function materialize(state: MusicQueueState): {
  audioTracks: AudioTrack[];
  duration: number;
} {
  let cumulative = 0;
  const audioTracks: AudioTrack[] = state.positions.map((originalIndex, index) => {
    const track = state.order[originalIndex];
    const duration = track?.durationSeconds ?? 0;
    const audioTrack: AudioTrack = {
      index,
      startOffset: cumulative,
      duration,
      title: track?.title ?? null,
      contentUrl: track?.id ?? null,
      mimeType: null,
      artist: track?.artist ?? null,
    };
    cumulative += duration;
    return audioTrack;
  });
  return { audioTracks, duration: cumulative };
}

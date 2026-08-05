/**
 * The player's session state: what's loaded, whether it's playing, at what time
 * — none of it is React Query's job (it isn't server data fetched by key) and
 * none of it should survive a reload (unlike `settingsStore.ts`'s preferences,
 * which persist deliberately). All the actions that touch `currentTime` route
 * through `playback.ts`'s pure `clampSeek`, so "seek past the end" or "seek to
 * NaN" can never produce a value the UI or `<audio>` element has to guard
 * against a second time.
 *
 * `load` takes both the `LibraryItem` (for title/author/cover — metadata that
 * doesn't change once the item is fetched) and the freshly-opened
 * `PlaybackSession` (for tracks/chapters/duration/current time) rather than the
 * item alone: `normalizePlaybackSession` guarantees the session's `audioTracks`/
 * `chapters`/`currentTime` are always populated, while `LibraryItem.media`'s own
 * `tracks`/`chapters` are only present on an *expanded* fetch — the session is
 * the authoritative source for playback, the item is only ever the display
 * chrome around it.
 */
import { create } from 'zustand';
import type { AudioTrack, Chapter, LibraryItem, PlaybackSession } from '../api/types.js';
import { clampSeek } from '../features/player/playback.js';
import type { PlaybackSource } from '../features/player/playbackSource.js';

export interface Bookmark {
  id: string;
  time: number;
  title: string;
}

export interface PlayerState {
  currentItem: LibraryItem | null;
  sessionId: string | null;
  /**
   * What actually plays the loaded item: how to report progress upstream and
   * how to resolve a track into a URL `<audio>` can load. `null` only before
   * the first `load()` — every call to `load()` sets `sessionId` and `source`
   * together, so a truthy `sessionId` always implies a non-null `source`. See
   * `features/player/playbackSource.ts` for why this exists: an Audiobookshelf
   * session and a future non-session source (e.g. Jellyfin) disagree on both
   * of these, and this is the seam that lets the rest of the player — this
   * store, `useAudioElement`, `useProgressSync` — stay agnostic to which.
   */
  source: PlaybackSource | null;
  /** Non-null when the loaded session is one episode of `currentItem` (a podcast) rather
   *  than the item itself (a book) — mirrors `PlaybackSession.episodeId`. What the
   *  transport surfaces use to decide whether to show episode-vs-podcast title billing;
   *  see `playerUi.ts`'s `playerDisplayMeta`. */
  episodeId: string | null;
  /** The session's own display title — the *episode's* title when `episodeId` is set, the
   *  book's title otherwise. Distinct from `currentItem.media.title`, which is always the
   *  library item's (for an episode, the podcast's) own title. */
  displayTitle: string;
  tracks: AudioTrack[];
  chapters: Chapter[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  /** Absolute epoch-ms deadline, or `null` when no sleep timer is running — read via `sleepTimerRemaining`. */
  sleepTimerEndsAt: number | null;
  bookmarks: Bookmark[];
  /**
   * Overrides `useAudioElement.ts`'s built-in "continue to the next `AudioTrack`, or pause"
   * handling of the underlying `<audio>` element's native `ended` event — set by
   * `features/music/musicQueueController.ts` for a Jellyfin queue, whose shuffle/repeat/
   * cross-page policy an audiobook's own file-boundary timeline has no concept of. `load()`
   * always resets this to `null`, so switching from a music queue to a book or podcast
   * episode clears it automatically: `ItemPage.tsx`/`PodcastDetailPage.tsx` never need to
   * know this field exists, and their sessions' `ended` handling is exactly what it was
   * before this field was added.
   */
  onTrackEnded: (() => void) | null;
  setOnTrackEnded: (fn: (() => void) | null) => void;
  /**
   * Replaces `tracks`/`duration` in place, touching nothing else — unlike `load()`, which
   * resets the whole session (`currentTime`, `isPlaying`, bookmarks, ...). What a music
   * queue's shuffle toggle, repeat-mode change, or cross-page fetch uses to extend or
   * reorder what plays next without interrupting whatever is currently playing. See
   * `features/music/musicQueueController.ts` and `state/musicQueueStore.ts`.
   */
  setTracks: (tracks: AudioTrack[], duration: number) => void;
  load: (item: LibraryItem, session: PlaybackSession, source: PlaybackSource) => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  /** Positive `delta` skips forward, negative skips back — the caller (a skip button) decides the magnitude from `settingsStore`. */
  skip: (deltaSeconds: number) => void;
  setRate: (rate: number) => void;
  /** `ms` is a duration from now, not an absolute deadline — the store does the `Date.now()` arithmetic once, here, so every caller doesn't have to. */
  setSleepTimer: (ms: number | null) => void;
  addBookmark: (time: number, title: string) => void;
  removeBookmark: (id: string) => void;
  close: () => void;
}

const INITIAL_STATE = {
  currentItem: null,
  sessionId: null,
  source: null,
  episodeId: null,
  displayTitle: '',
  tracks: [],
  chapters: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  sleepTimerEndsAt: null,
  bookmarks: [],
  onTrackEnded: null,
} satisfies Omit<
  PlayerState,
  | 'setOnTrackEnded'
  | 'setTracks'
  | 'load'
  | 'play'
  | 'pause'
  | 'seek'
  | 'skip'
  | 'setRate'
  | 'setSleepTimer'
  | 'addBookmark'
  | 'removeBookmark'
  | 'close'
>;

/** A bookmark id only needs to be unique within one loaded session's list, not globally durable. */
function bookmarkId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `bookmark-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  ...INITIAL_STATE,

  load: (item, session, source) =>
    set({
      currentItem: item,
      sessionId: session.id,
      source,
      episodeId: session.episodeId,
      displayTitle: session.displayTitle,
      tracks: session.audioTracks,
      chapters: session.chapters,
      duration: session.duration,
      currentTime: session.currentTime,
      isPlaying: false,
      playbackRate: 1,
      sleepTimerEndsAt: null,
      bookmarks: [],
      // See this field's own doc comment: every load starts with the built-in pause-or-
      // continue `ended` handling, and only a music queue (`musicQueueController.ts`,
      // called *after* `load()`) opts back into its own policy.
      onTrackEnded: null,
    }),

  setOnTrackEnded: (fn) => set({ onTrackEnded: fn }),
  setTracks: (tracks, duration) => set({ tracks, duration }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),

  seek: (time) => set({ currentTime: clampSeek(time, get().duration) }),

  skip: (deltaSeconds) => {
    const state = get();
    set({ currentTime: clampSeek(state.currentTime + deltaSeconds, state.duration) });
  },

  setRate: (rate) => set({ playbackRate: rate }),

  setSleepTimer: (ms) => set({ sleepTimerEndsAt: ms === null ? null : Date.now() + ms }),

  addBookmark: (time, title) =>
    set((state) => ({
      bookmarks: [...state.bookmarks, { id: bookmarkId(), time, title }],
    })),

  removeBookmark: (id) =>
    set((state) => ({ bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== id) })),

  close: () => set(INITIAL_STATE),
}));

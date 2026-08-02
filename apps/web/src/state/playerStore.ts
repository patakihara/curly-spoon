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

export interface Bookmark {
  id: string;
  time: number;
  title: string;
}

export interface PlayerState {
  currentItem: LibraryItem | null;
  sessionId: string | null;
  tracks: AudioTrack[];
  chapters: Chapter[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  /** Absolute epoch-ms deadline, or `null` when no sleep timer is running — read via `sleepTimerRemaining`. */
  sleepTimerEndsAt: number | null;
  bookmarks: Bookmark[];
  load: (item: LibraryItem, session: PlaybackSession) => void;
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
  tracks: [],
  chapters: [],
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  sleepTimerEndsAt: null,
  bookmarks: [],
} satisfies Omit<
  PlayerState,
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

  load: (item, session) =>
    set({
      currentItem: item,
      sessionId: session.id,
      tracks: session.audioTracks,
      chapters: session.chapters,
      duration: session.duration,
      currentTime: session.currentTime,
      isPlaying: false,
      playbackRate: 1,
      sleepTimerEndsAt: null,
      bookmarks: [],
    }),

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

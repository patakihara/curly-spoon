/**
 * Keeps an open tab on the app the server runs. The tab reads the commit `/api/health` reports
 * when it starts, asks again every minute and whenever it is shown, and reloads once the server
 * reports another commit. It waits while audio plays: the reload comes once nothing has played for
 * 2 s, so the hand-over from one file to the next does not count as stopping. A null commit (a
 * server not built into an image) never reloads, and a tab reloads at most once for a commit, so
 * a server flipping between two images cannot loop it. No UI: the reload is silent.
 */
import { type ApiClient, createApiClient, fetchHealth } from './api/client';

/** Whether anything plays, and word when that may have changed. */
export interface MediaState {
  isPlaying(): boolean;
  /** Calls `listener` whenever playing may have started or stopped; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The part of the document the watch uses to know when the tab is shown. */
export interface PageLike {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** The part of the document `mediaInDocument` reads: its media elements and their events. */
export interface MediaDocument {
  addEventListener(type: string, listener: () => void, capture: boolean): void;
  removeEventListener(type: string, listener: () => void, capture: boolean): void;
  querySelectorAll(selectors: 'audio, video'): Iterable<{ paused: boolean; ended: boolean }>;
}

export interface UpdateWatchOptions {
  /** The API; same origin by default. */
  api?: ApiClient;
  /** Reloads the tab; `location.reload()` by default. */
  reload?: () => void;
  /** Whether audio plays; every audio or video element in the document by default. */
  media?: MediaState;
  /** The document, for its visibility. */
  page?: PageLike;
  /** Where the tab remembers the commit it last reloaded for; `sessionStorage` by default. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** How often the tab asks the server which commit it runs. */
const EVERY_MS = 60_000;
/** How long nothing must play before the tab reloads. */
const QUIET_MS = 2_000;
const RELOADED_FOR = 'auralis.reloadedFor';

/** Media events that start or stop playing; media events do not bubble, so they are captured. */
const MEDIA_EVENTS = ['play', 'playing', 'pause', 'ended', 'emptied'];

/** Whether any audio or video element in `doc` plays, heard through its media events. */
export function mediaInDocument(doc: MediaDocument): MediaState {
  return {
    isPlaying: () => [...doc.querySelectorAll('audio, video')].some((m) => !m.paused && !m.ended),
    subscribe(listener) {
      MEDIA_EVENTS.forEach((type) => doc.addEventListener(type, listener, true));
      return () => MEDIA_EVENTS.forEach((type) => doc.removeEventListener(type, listener, true));
    },
  };
}

const sessionStore = () => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

/** Starts watching; returns the stop. */
export function watchForUpdates(options: UpdateWatchOptions = {}): () => void {
  const api = options.api ?? createApiClient();
  const reload = options.reload ?? (() => location.reload());
  const media = options.media ?? mediaInDocument(document);
  const page = options.page ?? document;
  const storage = options.storage === undefined ? sessionStore() : options.storage;

  /** The commit the tab started on: undefined until the first answer. */
  let started: string | null | undefined;
  /** The commit to reload onto, once nothing plays. */
  let pending: string | null = null;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const reloadedFor = () => {
    try {
      return storage?.getItem(RELOADED_FOR) ?? null;
    } catch {
      return null;
    }
  };

  const settle = () => {
    if (stopped || pending === null) return;
    if (media.isPlaying()) {
      clearTimeout(quiet);
      quiet = undefined;
      return;
    }
    quiet ??= setTimeout(() => {
      quiet = undefined;
      if (stopped || pending === null || media.isPlaying()) return;
      try {
        storage?.setItem(RELOADED_FOR, pending);
      } catch {
        // A tab that cannot remember still reloads; it only loses the loop guard.
      }
      stopped = true;
      reload();
    }, QUIET_MS);
  };

  const check = async () => {
    let commit: string | null;
    try {
      ({ commit } = await fetchHealth(api));
    } catch {
      return;
    }
    if (stopped) return;
    if (started === undefined) {
      started = commit;
      return;
    }
    if (started === null || commit === null) return;
    if (commit === started) {
      // Back on the commit the tab runs: nothing to reload onto.
      pending = null;
      clearTimeout(quiet);
      quiet = undefined;
      return;
    }
    if (commit === pending || commit === reloadedFor()) return;
    pending = commit;
    settle();
  };

  const onShown = () => {
    if (page.visibilityState === 'visible') void check();
  };
  const unsubscribe = media.subscribe(settle);
  page.addEventListener('visibilitychange', onShown);
  const every = setInterval(() => void check(), EVERY_MS);
  void check();

  return () => {
    stopped = true;
    clearInterval(every);
    clearTimeout(quiet);
    unsubscribe();
    page.removeEventListener('visibilitychange', onShown);
  };
}

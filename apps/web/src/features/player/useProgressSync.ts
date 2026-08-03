/**
 * Reports playback position back to Audiobookshelf, so a book continued in the
 * browser resumes where it was left — on the phone, in another tab, or in
 * Audiobookshelf's own client. Mounted once, next to `useAudioElement`, since
 * like that hook it takes no arguments and reads the player store directly.
 *
 * Deliberately not a React Query mutation (see `api/queries.ts`): these are
 * fire-and-forget calls from a background interval whose results nothing
 * renders and no cache holds.
 *
 * **Every failure path here is swallowed.** A sync that fails is a position
 * that stays slightly stale, which is a far better outcome than an error
 * boundary tearing down the player mid-listen — losing the user's place is the
 * one thing this hook exists to prevent.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useApi } from '../../api/ApiContext.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { PROGRESS_SYNC_INTERVAL_MS, progressSyncPayload } from './progressSync.js';

export function useProgressSync(): void {
  const api = useApi();
  const sessionId = usePlayerStore((s) => s.sessionId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  /** When the current uninterrupted playing stretch began, or `null` while paused. */
  const playingSinceRef = useRef<number | null>(null);
  /** Playing time accumulated but not yet reported, in milliseconds. */
  const pendingMsRef = useRef(0);

  // Folds the open playing stretch into the accumulator and restarts it, so
  // `timeListened` is measured from wall-clock time spent playing rather than
  // from how far the position moved — see `progressSync.ts` for why that
  // distinction is the whole point.
  const collect = useCallback(() => {
    const startedAt = playingSinceRef.current;
    if (startedAt === null) return;
    const now = Date.now();
    pendingMsRef.current += now - startedAt;
    playingSinceRef.current = now;
  }, []);

  useEffect(() => {
    if (isPlaying) {
      playingSinceRef.current = Date.now();
      return;
    }
    collect();
    playingSinceRef.current = null;
  }, [collect, isPlaying]);

  useEffect(() => {
    if (!sessionId) return undefined;

    // The position is read from a subscription guarded on *this* session's id
    // rather than from `getState()` at flush time. The difference only shows up
    // in the final flush when one book replaces another: by then the store
    // already holds the new session, and reading it there would file the new
    // book's position against the old book's session.
    const snapshot = {
      currentTime: usePlayerStore.getState().currentTime,
      duration: usePlayerStore.getState().duration,
    };
    const unsubscribe = usePlayerStore.subscribe((state) => {
      if (state.sessionId !== sessionId) return;
      snapshot.currentTime = state.currentTime;
      snapshot.duration = state.duration;
    });

    const flush = () => {
      collect();
      const body = progressSyncPayload({ ...snapshot, playingMs: pendingMsRef.current });
      // A null body means the duration isn't known yet; keep accumulating
      // rather than discarding listening time that has genuinely happened.
      if (!body) return;
      pendingMsRef.current = 0;
      void api.syncSession(sessionId, body).catch(() => undefined);
    };

    // Best effort only: a browser tearing the page down may not let the request
    // finish. It costs nothing and turns "lost up to 15 seconds on tab close"
    // into "usually lost nothing".
    const handlePageHide = () => flush();
    window.addEventListener('pagehide', handlePageHide);

    const interval = setInterval(flush, PROGRESS_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      unsubscribe();
      // A final position first, then hand the session back. Ordering matters:
      // Audiobookshelf finalises the session on close, so a sync afterwards
      // would be reporting into a session that is no longer open.
      flush();
      void api.closeSession(sessionId).catch(() => undefined);
    };
  }, [api, collect, sessionId]);
}

/**
 * Reports playback position back to whichever upstream `playerStore.source`
 * names, so a book (or episode) continued in the browser resumes where it was
 * left — on the phone, in another tab, or in Audiobookshelf's own client.
 * Mounted once, next to `useAudioElement`, since like that hook it takes no
 * arguments and reads the player store directly.
 *
 * This hook owns *measuring* — wall-clock time spent playing, on the interval
 * below, and the position/duration snapshot passed alongside it — and hands
 * the result to `source.reportProgress` to decide what to do with it. See
 * `features/player/playbackSource.ts` for why that split exists and what it
 * lets a non-Audiobookshelf source do differently (including nothing).
 *
 * Deliberately not a React Query mutation (see `api/queries.ts`): reporting
 * happens from a background interval whose results nothing renders and no
 * cache holds.
 *
 * **Every failure path here is swallowed.** A sync that fails is a position
 * that stays slightly stale, which is a far better outcome than an error
 * boundary tearing down the player mid-listen — losing the user's place is the
 * one thing this hook exists to prevent. (The swallowing itself now lives
 * inside each `PlaybackProgressReporter` implementation, since only the
 * implementation knows what "failed" means for its own upstream.)
 */
import { useCallback, useEffect, useRef } from 'react';
import { usePlayerStore } from '../../state/playerStore.js';
import { PROGRESS_SYNC_INTERVAL_MS, progressSyncPayload } from './progressSync.js';

export function useProgressSync(): void {
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

    // Captured once, at the same moment `sessionId` is captured — not read
    // again from `getState()` later. `sessionId` and `source` are always set
    // together by `load()` (see `playerStore.ts`'s doc comment), so the
    // reporter this session was loaded with is the one that must sync and
    // close it, even if a later `load()` replaces `source` before this
    // effect's cleanup runs.
    const source = usePlayerStore.getState().source;

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

    // Shared by the periodic tick and the final flush: folds the open playing
    // stretch in via `collect()`, then turns the snapshot into a body — `null`
    // when `duration` isn't known yet, in which case the accumulated playing
    // time is deliberately left unreset so it isn't discarded.
    const computeBody = () => {
      collect();
      const body = progressSyncPayload({ ...snapshot, playingMs: pendingMsRef.current });
      if (body) pendingMsRef.current = 0;
      return body;
    };

    const tick = () => {
      const body = computeBody();
      // A null body means nothing has ever been worth reporting yet — unlike
      // the final flush below, there is no session-closing side effect riding
      // along here that still has to happen regardless.
      if (body) source?.reportProgress.onTick(body);
    };

    // Best effort only: a browser tearing the page down may not let the request
    // finish. It costs nothing and turns "lost up to 15 seconds on tab close"
    // into "usually lost nothing".
    const handlePageHide = () => tick();
    window.addEventListener('pagehide', handlePageHide);

    const interval = setInterval(tick, PROGRESS_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', handlePageHide);
      unsubscribe();
      // `onEnd` gets the body-or-null unconditionally: even a `null` body (no
      // sync worth sending) still has to hand the session back, which is
      // exactly why `onEnd` — unlike `onTick` — accepts `null`. The
      // sync-before-close ordering itself now lives inside the reporter.
      source?.reportProgress.onEnd(computeBody());
    };
  }, [collect, sessionId]);
}

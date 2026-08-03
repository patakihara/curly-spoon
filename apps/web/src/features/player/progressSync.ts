/**
 * The arithmetic behind progress sync, kept apart from the hook that schedules
 * it so it can be exercised without a DOM or a fake clock (this repo runs Vitest
 * in the `node` environment only).
 *
 * The load-bearing decision here is that **`timeListened` is measured from
 * wall-clock time spent playing, never from how far `currentTime` moved.** The
 * two are only equal when audio plays straight through at 1x: a seek, a chapter
 * jump or a ±30s skip moves the position without anyone listening, and
 * Audiobookshelf folds `timeListened` into the user's listening statistics
 * permanently. Deriving it from the position delta would inflate those stats
 * every time the listener scrubbed, which is both wrong and unfixable after the
 * fact — so the caller accumulates elapsed playing time and passes it in.
 */
import { clampSeek } from './playback.js';

/**
 * How often a playing session reports in. Matches the cadence Audiobookshelf's
 * own clients use: frequent enough that a crashed tab loses only seconds of
 * position, rare enough not to be a request every second per listener.
 */
export const PROGRESS_SYNC_INTERVAL_MS = 15_000;

/**
 * Whole seconds of listening represented by a stretch of wall-clock playing
 * time. Total by construction — a backwards clock step, or a non-finite input
 * from arithmetic on a timestamp that never got set, degrades to "nothing
 * listened" rather than poisoning the user's statistics with a negative or
 * `NaN` value the server would happily store.
 */
export function listenedSeconds(playingMs: number): number {
  if (!Number.isFinite(playingMs) || playingMs <= 0) return 0;
  return Math.round(playingMs / 1000);
}

export interface ProgressSyncInput {
  currentTime: number;
  duration: number;
  /** Wall-clock milliseconds spent actually playing since the last sync — not a position delta. */
  playingMs: number;
}

export interface ProgressSyncBody {
  currentTime: number;
  timeListened: number;
  duration: number;
}

/**
 * The body for one `POST /sessions/:id/sync`, or `null` when there is nothing
 * safe to report.
 *
 * `null` is returned whenever `duration` is not a usable positive number, which
 * is the state before a session finishes loading. The BFF's `syncBodySchema`
 * requires all three fields, so an early sync would be answered with a 400
 * rather than degrading quietly — withholding it is the total behaviour.
 *
 * A payload with `timeListened: 0` is still worth sending: seeking while paused
 * moves the position, and that position is exactly what should survive a reload.
 */
export function progressSyncPayload(input: ProgressSyncInput): ProgressSyncBody | null {
  const { currentTime, duration, playingMs } = input;
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return {
    currentTime: clampSeek(currentTime, duration),
    timeListened: listenedSeconds(playingMs),
    duration,
  };
}

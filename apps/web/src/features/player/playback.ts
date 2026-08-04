/**
 * The player's pure logic — kept apart from `playerStore.ts` and the components
 * that render it so it can be unit-tested without a DOM (this repo runs vitest
 * in the `node` environment only, per `vitest.config.ts`).
 *
 * `chapterAt`/`trackAt` both assume their input is sorted ascending by
 * `start`/`startOffset` — true of every list this app ever receives (the BFF's
 * upstream orders them, and nothing here ever reorders them) — and both walk the
 * list rather than binary-searching it: chapter/track counts are small (tens, not
 * thousands), so the simpler linear scan is the right trade.
 */
import type { AudioTrack, Chapter } from '../../api/types.js';

/**
 * The chapter whose `start` is the greatest one `<=` time — i.e. a time exactly on
 * a boundary belongs to the chapter *starting* there, and a time past the last
 * chapter's start (even past its nominal `end`, which can lag reality slightly)
 * still resolves to that last chapter rather than falling off the list.
 */
export function chapterAt(chapters: Chapter[], time: number): Chapter | undefined {
  let result: Chapter | undefined;
  for (const chapter of chapters) {
    if (chapter.start <= time) result = chapter;
    else break;
  }
  return result;
}

/** Same walk as `chapterAt`, but also returns how far `time` is past the track's own start. */
export function trackAt(
  tracks: AudioTrack[],
  time: number,
): { track: AudioTrack; offsetInTrack: number } | undefined {
  let chosen: AudioTrack | undefined;
  for (const track of tracks) {
    if (track.startOffset <= time) chosen = track;
    else break;
  }
  return chosen ? { track: chosen, offsetInTrack: time - chosen.startOffset } : undefined;
}

/**
 * The track immediately following `track` on its own timeline (matched by `index`, not
 * array position or object identity — same contract as `trackAt`). `undefined` past the
 * last track. What `useAudioElement.ts`'s `ended` handler uses to continue playback across
 * a track boundary — a multi-file audiobook's next file, or an album queue's next song —
 * without either caller needing its own notion of "what comes after this."
 */
export function nextTrack(tracks: AudioTrack[], track: AudioTrack): AudioTrack | undefined {
  return tracks.find((candidate) => candidate.index === track.index + 1);
}

/**
 * Guards every seek before it reaches `<audio>.currentTime` — an out-of-range or
 * non-finite value there either throws or silently no-ops depending on browser,
 * neither of which is a state this player wants to reason about downstream.
 */
export function clampSeek(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration < 0) return 0;
  if (!Number.isFinite(time)) return 0;
  return Math.min(duration, Math.max(0, time));
}

/** "1:02:03" once an hour is involved, "2:03" under one — never a leading "0:" hour. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const paddedSecs = String(secs).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSecs}`;
  return `${minutes}:${paddedSecs}`;
}

/** Speeds a listener can cycle through, slowest first. */
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Clamps rather than wraps at either end — cycling past 2x back to 0.75x (or the
 * reverse) would be a surprising jump for anyone stepping through with repeated
 * clicks. An unrecognised `current` (e.g. a stale/foreign value) is treated as if
 * it were 1x, so the control always lands somewhere on the known scale.
 */
export function nextRate(current: number, direction: 1 | -1): number {
  const index = RATES.indexOf(current as (typeof RATES)[number]);
  const currentIndex = index === -1 ? RATES.indexOf(1) : index;
  const nextIndex = Math.min(RATES.length - 1, Math.max(0, currentIndex + direction));
  // The clamp above keeps `nextIndex` in range, but `noUncheckedIndexedAccess` cannot
  // prove it; falling back to 1x keeps this total rather than asserting non-null.
  return RATES[nextIndex] ?? 1;
}

/** Milliseconds left on a running sleep timer, or `null` when none is set. Never negative. */
export function sleepTimerRemaining(endsAt: number | null, now: number): number | null {
  if (endsAt === null) return null;
  return Math.max(0, endsAt - now);
}

/** Skip-button intervals a listener can choose in Settings, back and forward independently. */
export const SKIP_INTERVALS = [10, 15, 20, 30] as const;
export type SkipInterval = (typeof SKIP_INTERVALS)[number];

/**
 * Guards a value read back out of `localStorage` (via `settingsStore`'s
 * persistence) before it is trusted as a `SkipInterval` — storage can hold
 * anything (a stale value from an older build, hand-edited JSON, `NaN` from a
 * bad migration), so this is the "parse at every upstream boundary" rule applied
 * to a storage boundary rather than a network one.
 */
export function isSkipInterval(value: unknown): value is SkipInterval {
  return typeof value === 'number' && (SKIP_INTERVALS as readonly number[]).includes(value);
}

/**
 * `AudioTrack.contentUrl` is upstream's own path (`/api/items/:itemId/file/:fileId`);
 * the BFF's proxy route only needs the trailing `fileId` segment
 * (`api.audioTrackUrl(itemId, fileId)`). Degrades to `null` rather than throwing
 * for malformed input — a track missing/short a `contentUrl` should leave a track
 * unplayable, not crash the player.
 */
export function fileIdFromContentUrl(contentUrl: string | null): string | null {
  if (!contentUrl) return null;
  const segments = contentUrl.split('/').filter(Boolean);
  return segments.at(-1) ?? null;
}

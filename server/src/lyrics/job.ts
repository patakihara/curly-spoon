/**
 * The lyrics backfill: one run resolves up to `batch` indexed Jellyfin tracks with no fresh
 * answer cached, in random order, one at a time, as `Lyrics.forTrack` does for the route, so the
 * two share one lookup per track. Each track is read from the index again just before its turn:
 * an answer is kept only for the version the index holds now, and the run is long.
 *
 * Polite to LRCLIB: after each track that asked it, the run waits `gapMs`, and after `stopAfter`
 * failures in a row (LRCLIB's or Jellyfin's) it ends, logged once; a later run tries again, the
 * random order meaning a track that keeps failing never holds the rest back. Light on the box:
 * the batch is a list of small rows and one answer is in hand at a time; nothing is kept between
 * runs. Nothing is asked until a whole Jellyfin index pass has run since `has_lyrics` was added,
 * since every track reads as having no lyrics file until then.
 */
import { indexedRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import { jellyfinIndexedForLyrics } from '../store/lyrics.js';
import type { JellyfinLyricsReader, Lyrics } from './service.js';

/** Tracks one run takes at most. */
export const LYRICS_BATCH = 100;
/** The wait after each LRCLIB lookup: one a second. */
export const LRCLIB_GAP_MS = 1_000;
/** Failures in a row that end a run. */
export const LYRICS_STOP_AFTER = 3;

export interface LyricsJobLog {
  info: (details: Record<string, unknown>, message: string) => void;
  warn: (details: Record<string, unknown>, message: string) => void;
}

export interface LyricsJobOptions {
  db: Db;
  lyrics: Pick<Lyrics, 'forTrack' | 'staleTracks'>;
  /** Jellyfin with Auralis's own key, as the index reads it. */
  jellyfin: JellyfinLyricsReader;
  sleep: (ms: number) => Promise<void>;
  log: LyricsJobLog;
  batch?: number;
  gapMs?: number;
  stopAfter?: number;
  /** True once the server is closing: the run ends before its next track. */
  stopped?: () => boolean;
}

export interface LyricsRun {
  /** True when nothing was asked, waiting on the first index pass to read each track's flag. */
  waiting: boolean;
  resolved: number;
  failed: number;
  lookups: number;
  /** Why the run ended before its batch did, or null. */
  ended: 'failures' | 'stopped' | null;
}

export async function runLyrics(options: LyricsJobOptions): Promise<LyricsRun> {
  const { db, lyrics, jellyfin, sleep, log } = options;
  const gapMs = options.gapMs ?? LRCLIB_GAP_MS;
  const stopAfter = options.stopAfter ?? LYRICS_STOP_AFTER;
  const stopped = options.stopped ?? (() => false);
  const run: LyricsRun = { waiting: false, resolved: 0, failed: 0, lookups: 0, ended: null };
  if (!jellyfinIndexedForLyrics(db)) return { ...run, waiting: true };

  let inARow = 0;
  for (const { id } of lyrics.staleTracks(options.batch ?? LYRICS_BATCH)) {
    if (stopped()) {
      run.ended = 'stopped';
      break;
    }
    const track = indexedRow(db, 'jellyfin', id);
    if (track?.kind !== 'track') continue;
    let asked = false;
    let lrclibFailed = false;
    const onLrclib = (answered: boolean) => {
      asked = true;
      lrclibFailed = !answered;
    };
    let failure: unknown = null;
    try {
      await lyrics.forTrack(track, jellyfin, { onLrclib });
      run.resolved += 1;
    } catch (error) {
      failure = error;
      run.failed += 1;
    }
    if (asked) run.lookups += 1;
    inARow = failure !== null || lrclibFailed ? inARow + 1 : 0;
    if (inARow >= stopAfter) {
      log.warn({ job: 'lyrics', failures: inARow, err: failure }, 'lyrics run ended on failures');
      run.ended = 'failures';
      break;
    }
    if (asked) await sleep(gapMs);
  }
  log.info(
    { job: 'lyrics', resolved: run.resolved, failed: run.failed, lookups: run.lookups },
    'lyrics run done',
  );
  return run;
}

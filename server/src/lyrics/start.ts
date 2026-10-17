/**
 * The server's lyrics, from its configuration: one `Lyrics` service, shared by the route and the
 * backfill job so the two make one lookup per track, asking LRCLIB at `LRCLIB_URL` (none when
 * empty) as Auralis by name. The backfill runs on the server's schedule with the Jellyfin API key,
 * as the index does; it is off when `LYRICS_EVERY_MINUTES` is 0, with no Jellyfin, or with LRCLIB
 * off, since then it would only read again what Jellyfin already gave.
 */
import type { FetchLike } from '../adapters/http/fetch.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { LRCLIB_USER_AGENT, LrclibClient } from '../adapters/lrclib/client.js';
import type { AppConfig } from '../config.js';
import { type JobLog, scheduleJob } from '../jobs/schedule.js';
import { readSecretFile } from '../secretFile.js';
import type { Db } from '../store/connection.js';
import { type LyricsJobLog, runLyrics } from './job.js';
import { Lyrics, type LyricsLog } from './service.js';

export function lyricsService(
  config: Pick<AppConfig, 'lyrics'>,
  deps: { db: Db; fetch: FetchLike; log: LyricsLog; now?: () => number },
): Lyrics {
  const { lrclibUrl } = config.lyrics;
  return new Lyrics({
    db: deps.db,
    log: deps.log,
    lrclib:
      lrclibUrl === null
        ? null
        : new LrclibClient({ baseUrl: lrclibUrl, fetch: deps.fetch, userAgent: LRCLIB_USER_AGENT }),
    now: deps.now ?? Date.now,
  });
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref();
  });

/** Starts the backfill; returns the function that stops it, ending a run before its next track. */
export function startLyricsJob(
  config: Pick<AppConfig, 'jellyfin' | 'lyrics'>,
  deps: {
    db: Db;
    fetch: FetchLike;
    lyrics: Lyrics;
    log: JobLog & LyricsJobLog;
    schedule?: typeof scheduleJob;
    sleep?: (ms: number) => Promise<void>;
  },
): () => void {
  const { everyMinutes, lrclibUrl } = config.lyrics;
  if (everyMinutes === 0 || config.jellyfin === null || lrclibUrl === null) return () => undefined;
  const jellyfin = new JellyfinClient({
    baseUrl: config.jellyfin.url,
    token: readSecretFile(config.jellyfin.keyFile, 'JELLYFIN_API_KEY'),
    fetch: deps.fetch,
  });
  let stopped = false;
  const schedule = deps.schedule ?? scheduleJob;
  const stop = schedule(
    {
      name: 'lyrics',
      everyMs: everyMinutes * 60_000,
      run: async () => {
        await runLyrics({
          db: deps.db,
          lyrics: deps.lyrics,
          jellyfin,
          sleep: deps.sleep ?? wait,
          log: deps.log,
          stopped: () => stopped,
        });
      },
    },
    deps.log,
  );
  return () => {
    stopped = true;
    stop();
  };
}

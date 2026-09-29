/**
 * Starts the index job on the server's schedule, with the keys its configuration names: the
 * listen-only Audiobookshelf key and the Jellyfin API key. Off when `INDEX_EVERY_MINUTES` is 0
 * or neither upstream has a key for it.
 */
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import type { FetchLike } from '../adapters/http/fetch.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import type { AppConfig } from '../config.js';
import { type JobLog, scheduleJob } from '../jobs/schedule.js';
import { readSecretFile } from '../secretFile.js';
import type { Db } from '../store/connection.js';
import { runIndex } from './job.js';

export function startIndexJob(
  config: Pick<AppConfig, 'abs' | 'jellyfin' | 'index'>,
  deps: { db: Db; fetch: FetchLike; log: JobLog; schedule?: typeof scheduleJob },
): () => void {
  const { everyMinutes, absKeyFile } = config.index;
  if (everyMinutes === 0) return () => undefined;
  const abs =
    config.abs !== null && absKeyFile !== null
      ? new AbsClient({
          baseUrl: config.abs.url,
          token: readSecretFile(absKeyFile, 'ABS_API_KEY'),
          fetch: deps.fetch,
        })
      : undefined;
  const jellyfin =
    config.jellyfin !== null
      ? new JellyfinClient({
          baseUrl: config.jellyfin.url,
          token: readSecretFile(config.jellyfin.keyFile, 'JELLYFIN_API_KEY'),
          fetch: deps.fetch,
        })
      : undefined;
  if (abs === undefined && jellyfin === undefined) return () => undefined;

  const schedule = deps.schedule ?? scheduleJob;
  return schedule(
    {
      name: 'index',
      everyMs: everyMinutes * 60_000,
      run: async () => {
        const result = await runIndex({ db: deps.db, abs, jellyfin });
        const failed = Object.entries(result).filter(([, r]) => r.error !== null);
        if (failed.length > 0) {
          throw new Error(failed.map(([source, r]) => `${source}: ${r.error}`).join('; '));
        }
      },
    },
    deps.log,
  );
}

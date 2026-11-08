/**
 * Kept songs' steps, when everything they need is here: songs that stream (the extractor), Jellyfin
 * and its key, and a Music folder in MEDIA_DIR. With any of it missing, songs cannot be kept and the
 * rest of the server runs as ever. MusicBrainz and the Cover Art Archive are optional: without them
 * a song is kept on YouTube Music's own names and art. Nothing here calls an upstream at start.
 *
 * The staging folder sits inside Music, so a staged file links into place on the same filesystem; a
 * dot folder, which Jellyfin never indexes. At start it holds only what a live request staged: a
 * file no request is waiting on is left from a cancel or an arrival a crash cut short, and goes.
 */
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import type { AppConfig } from '../../config.js';
import type { JobLog } from '../../jobs/schedule.js';
import type { Db } from '../../store/connection.js';
import { liveRequestsOf } from '../../store/requests.js';
import { folderLacking } from '../folder.js';
import type { MediumSteps } from '../steps.js';
import { songDownload, type SongStream } from './download.js';
import { songSearch } from './search.js';

/** The staging folder's name inside Music. */
export const STAGING_FOLDER = '.auralis-keep';

export interface SongStepsDeps {
  db: Db;
  fetch: FetchLike;
  log: JobLog;
  /** Songs that stream, through their cache; null with no extractor. */
  music: SongStream | null;
  /** Asks the request job for a turn. */
  wake: () => void;
}

/** The steps, or which setting keeps songs from being kept. */
export type SongSteps = { steps: MediumSteps } | { off: string };

/** Deletes what the staging folder holds for no live song request. */
function clearStaging(db: Db, stagingDir: string, log: JobLog): void {
  const live = new Set(
    liveRequestsOf(db, 'song', log).flatMap(({ target }) => target.ids.youtubeMusicId ?? []),
  );
  for (const name of readdirSync(stagingDir)) {
    if (!live.has(name.split('.')[0] ?? '')) {
      rmSync(join(stagingDir, name), { force: true, recursive: true });
    }
  }
}

export function songSteps(config: AppConfig, deps: SongStepsDeps): SongSteps {
  const { db, fetch, log, music, wake } = deps;
  if (music === null) return { off: 'EXTRACTOR_PATH' };
  if (config.jellyfin === null) return { off: 'JELLYFIN_URL and JELLYFIN_API_KEY_FILE' };
  const { mediaDir } = config.books;
  if (mediaDir === null) return { off: 'MEDIA_DIR' };
  const musicDir = join(mediaDir, 'Music');
  const lacking = folderLacking(musicDir, 'Music');
  if (lacking !== null) return { off: lacking };
  const stagingDir = join(musicDir, STAGING_FOLDER);
  try {
    mkdirSync(stagingDir, { recursive: true });
    clearStaging(db, stagingDir, log);
  } catch {
    return { off: 'a Music folder in MEDIA_DIR it may write to' };
  }

  const { musicBrainzUrl } = config.songs;
  const musicBrainz =
    musicBrainzUrl === null
      ? null
      : new MusicBrainzClient({
          baseUrl: musicBrainzUrl,
          fetch,
          userAgent: MUSICBRAINZ_USER_AGENT,
        });

  return {
    steps: {
      medium: 'song',
      prompt: true,
      search: songSearch({ db, musicBrainz, log }),
      download: songDownload({ stream: music, stagingDir, wake, log }),
      // Part E of M3.keep builds the import: remux, tag, place, report to Jellyfin.
      import: () => Promise.reject(new Error('kept songs are not imported yet')),
    },
  };
}

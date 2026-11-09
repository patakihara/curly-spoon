/**
 * Kept songs' steps, when everything they need is here: songs that stream (the extractor), Jellyfin
 * and its key, and a Music folder in MEDIA_DIR. With any of it missing, songs cannot be kept and the
 * rest of the server runs as ever. MusicBrainz and the Cover Art Archive are optional: without them
 * a song is kept on YouTube Music's own names and art. Nothing here calls an upstream at start.
 *
 * The staging folder sits in MEDIA_DIR beside Music, so a staged file links into place on the same
 * filesystem, and Jellyfin's Music library never sees it come and go: each file made or deleted
 * inside the library costs a whole library refresh. Each server stages in its own folder there,
 * named by an id it keeps in its data folder (`keep-instance`), as two servers may share one
 * MEDIA_DIR: one for trying a build beside the household's own. At start a server's folder holds only what its live
 * requests staged: a file no request is waiting on is left from a cancel or an arrival a crash cut
 * short, and goes. Another server's folder is never touched.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CoverArtClient, type Cover, COVER_MAX_BYTES } from '../../adapters/coverart/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { readCapped } from '../../adapters/http/publicFetch.js';
import { JellyfinClient } from '../../adapters/jellyfin/client.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../adapters/musicbrainz/client.js';
import type { ImageHeaders, UpstreamFile } from '../../adapters/stream.js';
import type { AppConfig } from '../../config.js';
import type { JobLog } from '../../jobs/schedule.js';
import { TrackRefused } from '../../music/index.js';
import { readSecretFile } from '../../secretFile.js';
import type { Db } from '../../store/connection.js';
import { liveRequestsOf } from '../../store/requests.js';
import { folderLacking } from '../folder.js';
import type { MediumSteps } from '../steps.js';
import { songDownload, type SongStream } from './download.js';
import { songImport } from './import.js';
import { songSearch } from './search.js';

/** The staging folder's name in MEDIA_DIR, beside Music, which holds each server's own folder. */
export const STAGING_FOLDER = '.auralis-keep';
/** The file in the data folder holding this server's id, which names its staging folder. */
export const INSTANCE_FILE = 'keep-instance';
const INSTANCE_ID = /^[0-9a-f]{16}$/;

/** This server's id, as its data folder keeps it: made once, the first time it is needed. */
export function instanceId(dataDir: string): string {
  const file = join(dataDir, INSTANCE_FILE);
  try {
    const kept = readFileSync(file, 'utf8').trim();
    if (INSTANCE_ID.test(kept)) return kept;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const made = randomBytes(8).toString('hex');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(file, `${made}\n`);
  return made;
}

export interface SongStepsDeps {
  db: Db;
  fetch: FetchLike;
  log: JobLog;
  /** Songs that stream, through their cache, with their art; null with no extractor. */
  music: (SongStream & SongArt) | null;
  /** Asks the request job for a turn. */
  wake: () => void;
}

/** A song's art as YouTube Music has it. */
export interface SongArt {
  openArt(id: string): Promise<UpstreamFile<ImageHeaders>>;
}

/** A song's art as a cover: null when it has none; refused past the cover's own cap. */
async function artCover(music: SongArt, id: string): Promise<Cover | null> {
  let file: UpstreamFile<ImageHeaders>;
  try {
    file = await music.openArt(id);
  } catch (error) {
    if (error instanceof TrackRefused) return null;
    throw error;
  }
  const bytes = await readCapped(new Response(file.body), COVER_MAX_BYTES);
  if (bytes === null) throw new Error('the art is too big');
  return { mime: file.headers['content-type'].split(';')[0]!.trim(), bytes: Buffer.from(bytes) };
}

/** The steps, or which setting keeps songs from being kept. */
export type SongSteps = { steps: MediumSteps } | { off: string };

/** Deletes what this server's staging folder holds for no live song request. */
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
  let instance: string;
  try {
    instance = instanceId(config.dataDir);
  } catch {
    return { off: 'a DATA_DIR it may write to' };
  }
  const stagingDir = join(mediaDir, STAGING_FOLDER, instance);
  try {
    mkdirSync(stagingDir, { recursive: true });
    clearStaging(db, stagingDir, log);
  } catch {
    return { off: 'a MEDIA_DIR it may write to' };
  }

  const { musicBrainzUrl, coverArtUrl } = config.songs;
  const musicBrainz =
    musicBrainzUrl === null
      ? null
      : new MusicBrainzClient({
          baseUrl: musicBrainzUrl,
          fetch,
          userAgent: MUSICBRAINZ_USER_AGENT,
        });

  const download = songDownload({ stream: music, stagingDir, wake, log });
  return {
    steps: {
      medium: 'song',
      prompt: true,
      search: songSearch({ db, musicBrainz, log }),
      download,
      import: songImport({
        db,
        musicDir,
        stagingDir,
        jellyfin: new JellyfinClient({
          baseUrl: config.jellyfin.url,
          token: readSecretFile(config.jellyfin.keyFile, 'JELLYFIN_API_KEY'),
          fetch,
          serverKey: true,
        }),
        staging: download,
        coverArt: coverArtUrl === null ? null : new CoverArtClient({ baseUrl: coverArtUrl, fetch }),
        art: (id) => artCover(music, id),
        now: Date.now,
        log,
      }),
    },
  };
}

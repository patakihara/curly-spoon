/**
 * A kept song's import. The staged stream's Opus packets move into an Ogg Opus file unchanged,
 * tagged from the match with its cover inside (`music/opus`), and the file is linked into its place
 * in Music (place.ts). Jellyfin is then told of that one path, `POST /Library/Media/Updated` as
 * `Created`, which is what its own folder monitor reports: never a library scan, never an item's
 * refresh. Jellyfin sees the file at its Music library's one folder, read at the first import.
 *
 * Until Jellyfin's newest tracks list that path (its monitor waits about 60 s) the import is
 * `waiting`; once they do, the track's album goes into the index and the request names the track.
 * A repeat of the key finds the file it placed by its `YOUTUBE_MUSIC_ID` and builds nothing, and
 * Jellyfin is told of a file once while the server runs. A file Jellyfin never lists ends the
 * request `notIndexed`, as the job does for every medium.
 *
 * The cover is the release's front from the Cover Art Archive, else its release group's, else
 * YouTube Music's art; a song with none is still kept. The staged stream goes once the song has
 * arrived.
 */
import { rm, stat } from 'node:fs/promises';
import { open } from 'node:fs/promises';
import { posix } from 'node:path';
import type { CoverArtClient, Cover } from '../../adapters/coverart/client.js';
import { stepFailure } from '../../adapters/http/unavailable.js';
import type { JellyfinClient, MusicLibrary } from '../../adapters/jellyfin/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import { indexOneJellyfinAlbum } from '../../libraryIndex/job.js';
import { remux } from '../../music/opus/remux.js';
import type { Db } from '../../store/connection.js';
import type { StoredRequest } from '../../store/requests.js';
import type { ImportOutcome, MediumSteps } from '../steps.js';
import { SongHandle, stagedPath } from './download.js';
import type { SongMatch } from './match.js';
import { findPlaced, placeSong, type PlacedSong, songPlace, SongRefused } from './place.js';
import { SongDetails } from './search.js';
import { songComments, SongMatchSchema } from './tags.js';

export interface SongImportDeps {
  db: Db;
  /** `MEDIA_DIR/Music` as this server sees it. */
  musicDir: string;
  /** The staging folder inside it, where the stream was staged and the file is built. */
  stagingDir: string;
  jellyfin: Pick<
    JellyfinClient,
    'musicLibrary' | 'reportCreated' | 'newestAudio' | 'findAlbum' | 'getAlbumTracks'
  >;
  /** Null when the Cover Art Archive is switched off. */
  coverArt: Pick<CoverArtClient, 'releaseFront' | 'groupFront'> | null;
  /** YouTube Music's art for a song, or null when it has none. */
  art: (youtubeMusicId: string) => Promise<Cover | null>;
  now: () => number;
  log: JobLog;
}

/** The file built for a song, in the staging folder beside its stream. */
const builtPath = (stagingDir: string, id: string) => posix.join(stagingDir, `${id}.opus`);

/** The cover a song is tagged with: the first of its sources that has one. */
async function coverOf(deps: SongImportDeps, id: string, match: SongMatch): Promise<Cover | null> {
  const sources: (() => Promise<Cover | null>)[] = [];
  const { coverArt } = deps;
  if (match.source === 'MusicBrainz' && coverArt !== null) {
    if (match.hasFrontCover) sources.push(() => coverArt.releaseFront(match.releaseId));
    sources.push(() => coverArt.groupFront(match.releaseGroupId));
  }
  sources.push(() => deps.art(id));
  for (const source of sources) {
    try {
      const cover = await source();
      if (cover !== null) return cover;
    } catch (error) {
      deps.log.error({ reason: (error as Error).message }, 'a kept song’s cover could not be read');
    }
  }
  return null;
}

/** Builds the Ogg Opus file from the staged stream, refusing a stream not wholly staged. */
async function build(
  deps: SongImportDeps,
  request: StoredRequest,
  id: string,
  match: SongMatch,
  cover: Cover | null,
): Promise<string> {
  const handle = SongHandle.safeParse(request.handle);
  const staged = stagedPath(deps.stagingDir, id);
  const size = (await stat(staged).catch(() => null))?.size;
  if (!handle.success || size !== handle.data.size) throw new SongRefused('notStaged');
  const built = builtPath(deps.stagingDir, id);
  await rm(built, { force: true });
  const from = await open(staged, 'r');
  try {
    const to = await open(built, 'wx');
    try {
      const picture = cover === null ? undefined : { mime: cover.mime, data: cover.bytes };
      await remux(from, to, songComments(id, match), picture);
    } finally {
      await to.close();
    }
  } catch (error) {
    await rm(built, { force: true });
    throw error;
  } finally {
    await from.close();
  }
  return built;
}

export function songImport(deps: SongImportDeps): MediumSteps['import'] {
  const jellyfin = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      throw stepFailure('jellyfin', error);
    }
  };
  let library: MusicLibrary | null = null;
  const musicLibrary = async (): Promise<MusicLibrary> => {
    library ??= await jellyfin(() => deps.jellyfin.musicLibrary());
    if (library === null || library.locations.length !== 1) {
      deps.log.error({}, 'Jellyfin has no one music library with one folder, so songs are off');
      library = null;
      throw new SongRefused('noMusicLibrary');
    }
    return library;
  };
  /** Paths Jellyfin has been told of since the server started. */
  const reported = new Set<string>();
  const running = new Map<string, Promise<PlacedSong>>();

  const placed = async (
    request: StoredRequest,
    id: string,
    match: SongMatch,
    signal: AbortSignal | undefined,
  ): Promise<PlacedSong> => {
    const place = songPlace(match);
    const there = await findPlaced(deps.musicDir, place, id);
    if (there !== null) return there;
    const cover = await coverOf(deps, id, match);
    const built = await build(deps, request, id, match, cover);
    try {
      return await placeSong({
        musicDir: deps.musicDir,
        place,
        youtubeMusicId: id,
        built,
        cover,
        ...(signal === undefined ? {} : { signal }),
      });
    } finally {
      await rm(built, { force: true });
    }
  };

  /** One placing per key at a time: a repeat waits for the one going, then finds its file. */
  const placedOnce = async (
    request: StoredRequest,
    id: string,
    match: SongMatch,
    signal: AbortSignal | undefined,
  ): Promise<PlacedSong> => {
    for (let earlier = running.get(id); earlier; earlier = running.get(id)) {
      await earlier.catch(() => undefined);
    }
    const work = placed(request, id, match, signal).finally(() => running.delete(id));
    running.set(id, work);
    return work;
  };

  return async (request, _key, signal): Promise<ImportOutcome> => {
    const details = SongDetails.parse(request.release?.details);
    const id = details.youtubeMusicId;
    const match = SongMatchSchema.parse(details.match);
    const { id: libraryId, locations } = await musicLibrary();

    const place = await placedOnce(request, id, match, signal);
    const path = posix.join(locations[0]!, place.relPath).normalize('NFC');
    if (!reported.has(path)) {
      await jellyfin(() => deps.jellyfin.reportCreated(path));
      reported.add(path);
    }

    const newest = await jellyfin(() => deps.jellyfin.newestAudio(libraryId));
    const row = newest.find((one) => one.Path?.normalize('NFC') === path);
    if (row?.AlbumId == null) return { kind: 'waiting' };
    const albumId = row.AlbumId;
    await jellyfin(() =>
      indexOneJellyfinAlbum(deps.db, deps.jellyfin, albumId, libraryId, deps.now()),
    );
    await rm(stagedPath(deps.stagingDir, id), { force: true });
    return { kind: 'arrived', ref: { source: 'jellyfin', id: row.Id } };
  };
}

/**
 * An album request's import: match, clone, tag, place, report, index.
 *
 * 1. **Match.** The finished torrent's fetched audio files (match.ts) against the group's editions.
 *    Files that are no edition answer `failed wrongRelease`, and the job goes on to the next release
 *    the search found, as it does for a stall.
 * 2. **Clone and tag.** Each file is cloned (clone.ts) into the key's own staging folder,
 *    `MEDIA_DIR/.auralis-albums/<key>/`, beside Music so Jellyfin sees nothing staged, and tagged
 *    there from the matched release's MusicBrainz lookup: FLAC as Vorbis comments, MP3 as ID3v2.4,
 *    the audio untouched. The torrent's own files are never written, so it goes on seeding.
 * 3. **Place.** Into Music (place.ts), with `cover.jpg`: the torrent's own front image (`cover`,
 *    `folder`, `front`), cloned, else the Cover Art Archive's release front, else its group's. It
 *    takes the place of a cover the keep made, never of the household's.
 * 4. **Report.** One `POST /Library/Media/Updated` names every placed file `Created`, as Jellyfin's
 *    own folder monitor would; never a library scan. Until Jellyfin's folder walk lists every track
 *    the import is `waiting`; then the album goes into the index.
 * 5. **Replace kept songs** of the album (replace.ts), and the request names the album.
 *
 * Folders made and paths placed are noted on the request's handle before each is made, and the
 * placing as a whole once it is done, so a repeat of the key finishes what a try cut short and
 * places nothing twice. The staging folder goes once the files are placed or the try fails.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, posix } from 'node:path';
import { z } from 'zod';
import type { CoverArtClient } from '../../adapters/coverart/client.js';
import { stepFailure } from '../../adapters/http/unavailable.js';
import type { JellyfinClient, MusicLibrary } from '../../adapters/jellyfin/client.js';
import type { FolderItem } from '../../adapters/jellyfin/schemas.js';
import type { MusicBrainzClient } from '../../adapters/musicbrainz/client.js';
import type { Release } from '../../adapters/musicbrainz/schemas.js';
import type { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import { indexOneJellyfinAlbum } from '../../libraryIndex/job.js';
import { writeFlacTags } from '../../music/flac/write.js';
import {
  type AlbumFolders,
  albumFolders,
  albumPlace,
  COVER_FILE,
  MAX_NAME_BYTES,
  musicName,
  trackNumberName,
  yearOf,
} from '../../music/folders.js';
import { writeId3Tags } from '../../music/id3/write.js';
import { type TrackTags, trackComments } from '../../music/tags.js';
import type { Db } from '../../store/connection.js';
import { noteHandle, type StoredRequest } from '../../store/requests.js';
import type { TorrentFile } from '../download/torrentFiles.js';
import { matchedOn } from '../songs/match.js';
import { musicBrainzTags } from '../songs/tags.js';
import type { ImportOutcome, MediumSteps } from '../steps.js';
import { type Clone, cloned, reflinkClone } from './clone.js';
import type { AlbumEditions, Edition } from './editions.js';
import { checkedSource, downloadedTracks, matchEdition } from './match.js';
import { type AlbumTrackFile, type PlacedAlbum, placeAlbum } from './place.js';
import { type JellyfinPerson, Replacing, replaceKept } from './replace.js';
import { AlbumRefused } from './refused.js';

/** The folder beside Music where each import key stages its files. */
export const ALBUM_STAGING = '.auralis-albums';

export interface AlbumImportDeps {
  db: Db;
  /** The folder holding `Music`, `Downloads` and the staging folder, all on one filesystem. */
  mediaDir: string;
  /** Where qBittorrent itself sees `Downloads`. */
  downloadsPath: string;
  qbittorrent: Pick<QbittorrentClient, 'withHashes' | 'files'>;
  editions: Pick<AlbumEditions, 'read'>;
  musicBrainz: Pick<MusicBrainzClient, 'release'>;
  /** Null when the Cover Art Archive is switched off. */
  coverArt: Pick<CoverArtClient, 'releaseFront' | 'groupFront'> | null;
  jellyfin: Pick<
    JellyfinClient,
    | 'musicLibrary'
    | 'reportCreated'
    | 'reportDeleted'
    | 'folderItems'
    | 'findAlbum'
    | 'getAlbumTracks'
    | 'userIds'
  >;
  /** Everyone linked on Jellyfin, each with a client acting as them, for the kept songs replaced. */
  people: () => JellyfinPerson[];
  /** The clone into staging; only a test passes its own. */
  clone?: Clone;
  now: () => number;
  log: JobLog;
}

const placedSchema = z.object({ ours: z.array(z.string()), household: z.array(z.string()) });

/** The torrent download's handle, with what the import notes on it. */
const AlbumHandle = z
  .object({
    hash: z.string(),
    key: z.string(),
    releaseGroupId: z.string(),
    /** Folders made in Music, noted before each is made. */
    made: z.array(z.string()).optional(),
    /** Paths placed in Music, noted before each link. */
    placing: z.array(z.string()).optional(),
    /** Where every track is, once the placing is done. */
    placed: placedSchema.optional(),
    /** The album's folders, once the placing is done. */
    folders: z.object({ artist: z.string(), album: z.string() }).optional(),
    /** How replacing the kept songs stands (replace.ts). */
    replacing: Replacing.optional(),
  })
  .passthrough();
type AlbumHandle = z.infer<typeof AlbumHandle>;

/** A torrent's own front image, by name, best first. */
const OWN_COVER = /^(cover|folder|front)\.jpe?g$/i;
const COVER_ORDER = ['cover', 'folder', 'front'];

/** The torrent's save path as seen from here, as it must sit in Downloads. */
function savePathHere(deps: AlbumImportDeps, savePath: string): string {
  const from = posix.normalize(`${deps.downloadsPath}/`);
  const path = posix.normalize(`${savePath}/`);
  if (!path.startsWith(from)) throw new AlbumRefused('outsideDownloads');
  return join(deps.mediaDir, 'Downloads', path.slice(from.length));
}

/**
 * Each track's tags, in the edition's order, from the release's lookup: only the media that hold
 * the edition (a CD's bonus DVD is not a disc of it), numbered from 1. Null when the release no
 * longer holds the edition.
 */
function tagsOf(release: Release, edition: Edition): TrackTags[] | null {
  const wanted = new Set(edition.tracks.map((track) => track.recordingId));
  const media = release.media
    .filter((m) => m.tracks.length > 0 && m.tracks.every((t) => wanted.has(t.recording.id)))
    .map((medium, at) => ({ ...medium, position: at + 1 }));
  const held = { ...release, media };
  const on = media.flatMap((medium) => medium.tracks.map((track) => ({ medium, track })));
  if (on.length !== edition.tracks.length) return null;
  if (on.some(({ track }, i) => track.recording.id !== edition.tracks[i]!.recordingId)) return null;
  return on.map((one) => musicBrainzTags(matchedOn('release', held, one)));
}

/** A track's file name: `<NN> - <title>.<ext>`, cut to fit. */
function fileName(tags: TrackTags, extension: string): { file: string; number: string } {
  const number = trackNumberName(tags.discNumber ?? 1, tags.trackNumber ?? 0, tags.discTotal ?? 1);
  const room =
    MAX_NAME_BYTES - Buffer.byteLength(`${number} - `) - Buffer.byteLength(`.${extension}`);
  return { file: `${number} - ${musicName(tags.title, room)}.${extension}`, number };
}

export function albumImport(deps: AlbumImportDeps): MediumSteps['import'] {
  const clone = deps.clone ?? reflinkClone();
  const musicDir = join(deps.mediaDir, 'Music');
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
      deps.log.error({}, 'Jellyfin has no one music library with one folder, so albums are off');
      library = null;
      throw new AlbumRefused('noMusicLibrary');
    }
    return library;
  };
  /** Paths Jellyfin has been told of since the server started. */
  const reported = new Set<string>();
  const running = new Map<string, Promise<unknown>>();

  /** The cover to place: the torrent's own front, else the archive's; null for none. */
  const coverOf = async (
    savePath: string,
    files: readonly TorrentFile[],
    release: Release,
    staging: string,
  ): Promise<string | null> => {
    const to = join(staging, COVER_FILE);
    const own = files
      .filter((file) => OWN_COVER.test(basename(file.path)))
      .sort(
        (a, b) =>
          COVER_ORDER.indexOf(OWN_COVER.exec(basename(a.path))![1]!.toLowerCase()) -
            COVER_ORDER.indexOf(OWN_COVER.exec(basename(b.path))![1]!.toLowerCase()) ||
          a.path.split('/').length - b.path.split('/').length,
      )[0];
    if (own !== undefined) {
      await cloned(clone, await checkedSource(savePath, own), to);
      return to;
    }
    const { coverArt } = deps;
    if (coverArt === null) return null;
    const sources = [
      ...(release.hasFrontCover ? [() => coverArt.releaseFront(release.id)] : []),
      () => coverArt.groupFront(release.releaseGroup.id),
    ];
    for (const source of sources) {
      try {
        const cover = await source();
        if (cover === null) continue;
        if (cover.mime !== 'image/jpeg') return null;
        await writeFile(to, cover.bytes, { flag: 'wx' });
        return to;
      } catch (error) {
        deps.log.error({ reason: (error as Error).message }, 'an album’s cover could not be read');
      }
    }
    return null;
  };

  /** Matches, clones, tags and places; or answers that the files are not the album. */
  const place = async (
    request: StoredRequest,
    handle: AlbumHandle,
    key: string,
    signal: AbortSignal | undefined,
  ): Promise<{ placed: PlacedAlbum; folders: AlbumFolders } | 'wrongRelease'> => {
    const [row] = await deps.qbittorrent.withHashes([handle.hash]);
    if (row === undefined) throw new AlbumRefused('torrentGone');
    if (row.progress !== 1) throw new AlbumRefused('notComplete');
    const savePath = savePathHere(deps, row.save_path);
    const fetched = (await deps.qbittorrent.files(row.hash))
      .filter((file) => file.priority > 0)
      .map((file) => ({ path: file.name, size: file.size }));
    const album = await deps.editions.read(handle.releaseGroupId);
    if (album === null) return 'wrongRelease';
    const match = matchEdition(await downloadedTracks(savePath, fetched), album.editions);
    if (match === null) return 'wrongRelease';
    const release = await deps.musicBrainz.release(match.release.id);
    const tags = release === null ? null : tagsOf(release, match.edition);
    if (release === null || tags === null) throw new AlbumRefused('releaseGone');

    const first = tags[0]!;
    const year = yearOf(first.originalDate, first.date);
    const folders = await albumFolders(musicDir, albumPlace(first.albumArtist, first.album, year));
    const staging = join(deps.mediaDir, ALBUM_STAGING, key);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    try {
      const files: AlbumTrackFile[] = [];
      for (const [i, track] of match.tracks.entries()) {
        const tag = tags[i]!;
        const { file, number } = fileName(tag, track.extension);
        const staged = join(staging, file);
        await cloned(clone, track.path, staged);
        if (track.extension === 'flac') await writeFlacTags(staged, trackComments(tag));
        else await writeId3Tags(staged, tag);
        files.push({ staged, file, number, title: tag.title, releaseTrackId: tag.releaseTrackId! });
      }
      const cover = await coverOf(savePath, fetched, release, staging);
      const notes = { ...handle };
      const placed = await placeAlbum({
        musicDir,
        folders,
        tracks: files,
        cover,
        made: {
          made: handle.made ?? [],
          note: (made) => noteHandle(deps.db, request.id, Object.assign(notes, { made })),
        },
        placing: {
          placed: handle.placing ?? [],
          note: (placing) => noteHandle(deps.db, request.id, Object.assign(notes, { placing })),
        },
        ...(signal === undefined ? {} : { signal }),
      });
      noteHandle(deps.db, request.id, Object.assign(notes, { placed, folders }));
      return { placed, folders };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  };

  /** One placing per key at a time: a repeat waits for the one going, then finds its files. */
  const placeOnce = async (...args: Parameters<typeof place>): ReturnType<typeof place> => {
    const key = args[2];
    for (let earlier = running.get(key); earlier; earlier = running.get(key)) {
      await earlier.catch(() => undefined);
    }
    const work = place(...args).finally(() => running.delete(key));
    running.set(key, work);
    return work;
  };

  /** The album folder's items, walked down from the library; null while a folder is not listed. */
  const albumItems = async (
    music: MusicLibrary,
    folders: AlbumFolders,
  ): Promise<FolderItem[] | null> => {
    let parent = music.id;
    let at = music.locations[0]!.replace(/\/+$/, '');
    for (const part of [folders.artist, folders.album]) {
      at = `${at}/${part}`.normalize('NFC');
      const items = await deps.jellyfin.folderItems(parent);
      const found = items.find((item) => item.Path?.normalize('NFC') === at);
      if (found === undefined) return null;
      parent = found.Id;
    }
    return deps.jellyfin.folderItems(parent);
  };

  return async (request, key, signal): Promise<ImportOutcome> => {
    const handle = AlbumHandle.parse(request.handle);
    const music = await musicLibrary();
    const pathOf = (relPath: string) => posix.join(music.locations[0]!, relPath).normalize('NFC');
    const replace = replaceKept({
      db: deps.db,
      musicDir,
      jellyfinPath: pathOf,
      libraryId: music.id,
      jellyfin: deps.jellyfin,
      people: deps.people,
      now: deps.now,
      log: deps.log,
    });
    let { placed, folders } = handle;
    if (placed === undefined || folders === undefined) {
      const done = await placeOnce(request, handle, key, signal);
      if (done === 'wrongRelease') return { kind: 'failed', reason: 'wrongRelease' };
      ({ placed, folders } = done);
    }

    const unreported = placed.ours.map(pathOf).filter((path) => !reported.has(path));
    if (unreported.length > 0) {
      await jellyfin(() => deps.jellyfin.reportCreated(unreported));
      for (const path of unreported) reported.add(path);
    }

    const items = await jellyfin(() => albumItems(music, folders));
    const listed = new Map((items ?? []).map((item) => [item.Path?.normalize('NFC'), item]));
    const tracks = [...placed.ours, ...placed.household].map((relPath) =>
      listed.get(pathOf(relPath)),
    );
    const albumId = tracks[0]?.AlbumId;
    if (tracks.some((track) => track === undefined) || albumId == null) return { kind: 'waiting' };
    await jellyfin(() =>
      indexOneJellyfinAlbum(deps.db, deps.jellyfin, albumId, music.id, deps.now()),
    );
    const replaced = await replace({
      requestId: request.id,
      releaseGroupId: handle.releaseGroupId,
      albumId,
      trackIds: tracks.map((track) => track!.Id),
    });
    if (replaced === 'waiting') return { kind: 'waiting' };
    return { kind: 'arrived', ref: { source: 'jellyfin', id: albumId } };
  };
}

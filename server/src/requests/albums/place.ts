/**
 * Puts an album's tagged files in Music, by the shared folder rules (`music/folders.ts`):
 * `<album artist>/<year> - <album>/<NN> - <title>.<ext>`, into the album's folder already there in
 * any of the household's forms.
 *
 * Each file goes in by `link`, never `rename`, so no name that is taken is ever replaced. A position
 * holding a file that carries this track's `MUSICBRAINZ_RELEASETRACKID` is an earlier try's, and
 * stands as placed. A position whose number and title a household file already has, of any kind, is
 * skipped: the household has the track. A kept song's `.opus` is no household file; replacing it is
 * the import's next phase. Each path is noted before its link, as each folder is before it is made,
 * so a try cut short is finished by the next one under the key.
 *
 * `cover.jpg` goes beside the files where the folder has none, or where the one there is the keep's:
 * the art a kept song beside it carries (the keep writes `cover.jpg` only into a folder it made, from
 * the song's own art), which gives way to the release's. Any other cover is the household's and
 * stays. A placing that fails takes away the folders it made, each only while empty.
 */
import { chmod, link, lstat, readdir, readFile, rename } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { trackFields } from '../../music/audio/fields.js';
import {
  type AlbumFolders,
  COVER_FILE,
  FILE_MODE,
  filesOfTrack,
  type MadeFolders,
  makeFolders,
  unmakeFolders,
} from '../../music/folders.js';
import { keptIdOf, keptTagsOf } from '../songs/place.js';
import { AlbumRefused } from './refused.js';

/** One track's tagged file in staging, and where it goes. */
export interface AlbumTrackFile {
  staged: string;
  /** Its name in the album's folder, extension and all. */
  file: string;
  /** The number the name carries (`03`, `2-03`) and the title, by which a household file is known. */
  number: string;
  title: string;
  releaseTrackId: string;
}

/** The paths this import placed, as its request notes them; and noting one more. */
export interface NotedPaths {
  placed: readonly string[];
  note: (placed: string[]) => void;
}

export interface PlaceAlbumInput {
  musicDir: string;
  folders: AlbumFolders;
  tracks: readonly AlbumTrackFile[];
  /** The cover in staging, or null for none. */
  cover: string | null;
  made: MadeFolders;
  placing: NotedPaths;
  signal?: AbortSignal;
}

/** Where the album's tracks are, as paths under Music. */
export interface PlacedAlbum {
  /** Placed by this import, now or by an earlier try. */
  ours: string[];
  /** The household's own files of tracks it already had. */
  household: string[];
}

async function isOurs(path: string, releaseTrackId: string): Promise<boolean> {
  const there = await lstat(path).catch(() => null);
  if (there === null || !there.isFile()) return false;
  return (await trackFields(path).catch(() => null))?.releaseTrackId === releaseTrackId;
}

/** The household's file of the track, if it has one; a kept song's file is not. */
async function householdFile(
  musicDir: string,
  folders: AlbumFolders,
  track: AlbumTrackFile,
): Promise<string | null> {
  for (const relPath of await filesOfTrack(musicDir, folders, track)) {
    if ((await keptIdOf(join(musicDir, relPath))) === null) return relPath;
  }
  return null;
}

/** Links a file where nothing is; answers false when the name is taken. */
async function linkNew(from: string, to: string): Promise<boolean> {
  try {
    await link(from, to);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

/** Whether the folder's `cover.jpg` is the keep's: the art of a kept song beside it. */
async function keepsCover(albumDir: string): Promise<boolean> {
  const cover = await readFile(join(albumDir, COVER_FILE)).catch(() => null);
  if (cover === null) return false;
  for (const name of await readdir(albumDir)) {
    if (!/\.opus$/i.test(name)) continue;
    if ((await keptTagsOf(join(albumDir, name)))?.picture?.data.equals(cover)) return true;
  }
  return false;
}

export async function placeAlbum(input: PlaceAlbumInput): Promise<PlacedAlbum> {
  const { musicDir, folders, tracks, cover, made, placing, signal } = input;
  const stop = () => {
    if (signal?.aborted) throw new AlbumRefused('timedOut');
  };
  stop();
  const ours = await makeFolders(musicDir, [folders.artist, folders.album], made);
  try {
    const placed: PlacedAlbum = { ours: [], household: [] };
    const noted = [...placing.placed];
    for (const track of tracks) {
      const relPath = posix.join(folders.artist, folders.album, track.file);
      const to = join(musicDir, relPath);
      if (await isOurs(to, track.releaseTrackId)) {
        placed.ours.push(relPath);
        continue;
      }
      const theirs = await householdFile(musicDir, folders, track);
      if (theirs !== null) {
        placed.household.push(theirs);
        continue;
      }
      stop();
      if (!noted.includes(relPath)) {
        noted.push(relPath);
        placing.note([...noted]);
      }
      await chmod(track.staged, FILE_MODE);
      if ((await linkNew(track.staged, to)) || (await isOurs(to, track.releaseTrackId))) {
        placed.ours.push(relPath);
      } else {
        placed.household.push(relPath);
      }
    }
    if (cover !== null) {
      await chmod(cover, FILE_MODE);
      const albumDir = join(musicDir, folders.artist, folders.album);
      const to = join(albumDir, COVER_FILE);
      if (!(await linkNew(cover, to)) && (await keepsCover(albumDir))) await rename(cover, to);
    }
    return placed;
  } catch (error) {
    await unmakeFolders(musicDir, made, ours);
    throw error;
  }
}

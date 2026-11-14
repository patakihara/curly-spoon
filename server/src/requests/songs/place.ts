/**
 * Where a kept song goes in Music, and putting it there, by the shared folder rules
 * (`music/folders.ts`): its album's folder, no year or number where the match has none. Where the
 * album's folder already holds a file of the same track number and title, of any kind, the household
 * has the song: nothing is added, and the request is answered by that file.
 *
 * The file is built in the staging folder and hard linked into place, never renamed: a link refuses
 * a name that is taken, so no household file is ever replaced. A file there that carries this
 * song's `YOUTUBE_MUSIC_ID` is its own, placed by an earlier try of the same key, and is answered
 * as it is; any other name taken moves this one to ` (2)`, then on. `cover.jpg` is written only into
 * an album folder this import made, and only where it has none.
 */
import { chmod, link, lstat, open } from 'node:fs/promises';
import { join, posix } from 'node:path';
import {
  type AlbumFolders,
  type AlbumPlace,
  albumPlace,
  coverBeside,
  FILE_MODE,
  filesOfTrack,
  MAX_NAME_BYTES,
  type MadeFolders,
  makeFolders,
  musicName,
  trackNumberName,
  unmakeFolders,
  yearOf,
} from '../../music/folders.js';
import { oggPackets } from '../../music/opus/ogg.js';
import { type OpusTags, readOpusTagsPacket } from '../../music/opus/remux.js';
import type { SongMatch } from './match.js';
import { YOUTUBE_MUSIC_ID } from './tags.js';

export type SongRefusal =
  /** The staged stream is missing or wrong, and its song could not be staged again. */
  | 'notStaged'
  /** Every free name up to the last tried is taken. */
  | 'noFreeName'
  /** The step's time limit passed before the link, so nothing reached Music. */
  | 'timedOut'
  /** Jellyfin has no one music library with one folder, so the file has nowhere it would be seen. */
  | 'noMusicLibrary';

/** An import that will not go on: it fails the request. */
export class SongRefused extends Error {
  override readonly name = 'SongRefused';

  constructor(readonly reason: SongRefusal) {
    super(`song import refused: ${reason}`);
  }
}

const EXTENSION = '.opus';
/** The most names tried: the plain one, then ` (2)` up to this. */
const MOST_NAMES = 20;
/** What ` (20).opus` adds to a file's stem. */
const SUFFIX_ROOM = Buffer.byteLength(` (${MOST_NAMES})${EXTENSION}`);

/** A song's place, each part already a safe name; `file` has no extension or suffix. */
export interface SongPlace extends AlbumPlace {
  file: string;
  /** The track's number, as the file is named by (`03`, `2-03`), or null; and its title. */
  number: string | null;
  title: string;
}

export function songPlace(match: SongMatch): SongPlace {
  if (match.source === 'YouTube Music') {
    const title = musicName(match.title, MAX_NAME_BYTES - SUFFIX_ROOM);
    return {
      ...albumPlace(match.artists[0]?.name ?? match.artist, match.album, null),
      file: title,
      number: null,
      title,
    };
  }
  const number = trackNumberName(match.discNumber, match.trackNumber, match.discTotal);
  const title = musicName(
    match.title,
    MAX_NAME_BYTES - SUFFIX_ROOM - Buffer.byteLength(`${number} - `),
  );
  return {
    ...albumPlace(match.albumArtist, match.album, yearOf(match.originalDate, match.date)),
    file: `${number} - ${title}`,
    number,
    title,
  };
}

/** The `YOUTUBE_MUSIC_ID` an Ogg Opus file carries, or null for any other file. */
export async function keptIdOf(path: string): Promise<string | null> {
  return (await keptTagsOf(path))?.id ?? null;
}

/** A kept song's id and the art its tags carry; null for a file that is not a kept song's. */
export async function keptTagsOf(
  path: string,
): Promise<{ id: string; picture: OpusTags['picture'] } | null> {
  let file;
  try {
    file = await open(path, 'r');
  } catch {
    return null;
  }
  try {
    let index = 0;
    for await (const packet of oggPackets(file)) {
      if (index++ === 0) continue;
      const tags = readOpusTagsPacket(packet.data);
      const id = tags.comments.find(({ key }) => key === YOUTUBE_MUSIC_ID)?.value;
      return id === undefined ? null : { id, picture: tags.picture };
    }
    return null;
  } catch {
    return null;
  } finally {
    await file.close();
  }
}

/** The household's own file of this track in the album's folder, or null when there is none. */
export async function householdTrack(
  musicDir: string,
  folders: AlbumFolders,
  place: SongPlace,
): Promise<PlacedSong | null> {
  const [relPath] = await filesOfTrack(musicDir, folders, place);
  return relPath === undefined ? null : { relPath, outcome: 'household' };
}

const nameAt = (place: SongPlace, n: number) =>
  `${place.file}${n === 1 ? '' : ` (${n})`}${EXTENSION}`;

/** Where a song is in Music, as a path under it with `/` between parts. */
export interface PlacedSong {
  relPath: string;
  /**
   * `placed` when this call linked it; `existing` when an earlier try had; `household` when the
   * household's own file of the track was there, and nothing was added.
   */
  outcome: 'placed' | 'existing' | 'household';
}

/** This song's own file, placed by an earlier try, or null when none is there. */
export async function findPlaced(
  musicDir: string,
  folders: AlbumFolders,
  place: SongPlace,
  youtubeMusicId: string,
): Promise<PlacedSong | null> {
  for (let n = 1; n <= MOST_NAMES; n += 1) {
    const relPath = posix.join(folders.artist, folders.album, nameAt(place, n));
    const there = await lstat(join(musicDir, relPath)).catch(() => null);
    if (there === null) return null;
    if (there.isFile() && (await keptIdOf(join(musicDir, relPath))) === youtubeMusicId) {
      return { relPath, outcome: 'existing' };
    }
  }
  return null;
}

export interface PlaceSongInput {
  musicDir: string;
  folders: AlbumFolders;
  place: SongPlace;
  youtubeMusicId: string;
  /** The finished file in the staging folder; it is linked, and left for the caller to remove. */
  built: string;
  /** The cover, written as `cover.jpg` only when it is a JPEG, into an album folder made here. */
  cover: { mime: string; bytes: Buffer } | null;
  /** The folders earlier tries made, and where more are noted. */
  made: MadeFolders;
  signal?: AbortSignal;
}

/** Links the built file into its place under the first free name, and the cover beside it. */
export async function placeSong(input: PlaceSongInput): Promise<PlacedSong> {
  const { musicDir, folders: at, place, youtubeMusicId, built, cover, signal, made } = input;
  if (signal?.aborted) throw new SongRefused('timedOut');
  const ours = await makeFolders(musicDir, [at.artist, at.album], made);
  try {
    await chmod(built, FILE_MODE);
    let placed: PlacedSong | null = null;
    for (let n = 1; n <= MOST_NAMES && placed === null; n += 1) {
      const relPath = posix.join(at.artist, at.album, nameAt(place, n));
      const to = join(musicDir, relPath);
      try {
        await link(built, to);
        placed = { relPath, outcome: 'placed' };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if ((await keptIdOf(to)) === youtubeMusicId) placed = { relPath, outcome: 'existing' };
      }
    }
    if (placed === null) throw new SongRefused('noFreeName');
    const albumFolder = posix.join(at.artist, at.album);
    if (cover?.mime === 'image/jpeg' && ours.includes(albumFolder)) {
      await coverBeside(join(musicDir, albumFolder), cover.bytes);
    }
    return placed;
  } catch (error) {
    await unmakeFolders(musicDir, made, ours);
    throw error;
  }
}

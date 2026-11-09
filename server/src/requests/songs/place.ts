/**
 * Where a kept song goes in Music, and putting it there. The household's tidy form:
 * `<album artist>/<year> - <album>/<NN> - <title>.opus`, with a disc before the number only on a
 * release of several discs, no year or number where the match has none, and an artist folder there
 * under another case reused.
 *
 * The file is built in the staging folder and hard linked into place, never renamed: a link refuses
 * a name that is taken, so no household file is ever replaced. A file there that carries this
 * song's `YOUTUBE_MUSIC_ID` is its own, placed by an earlier try of the same key, and is answered
 * as it is; any other name taken moves this one to ` (2)`, then on. Folders it makes are 0775 and
 * the file 0664, set here as the server's umask would leave them closed to Jellyfin's group, which
 * writes its `.nfo` files beside them. `cover.jpg` is written only where the album has none.
 */
import { chmod, link, lstat, mkdir, open, readdir, rm, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { oggPackets } from '../../music/opus/ogg.js';
import { readOpusTagsPacket } from '../../music/opus/remux.js';
import type { SongMatch } from './match.js';
import { YOUTUBE_MUSIC_ID } from './tags.js';

export type SongRefusal =
  /** A name with nothing left once made safe. */
  | 'unsafeName'
  /** The staged stream is missing, or not the size its download said. */
  | 'notStaged'
  /** Every free name up to the last tried is taken. */
  | 'noFreeName'
  /** The artist's name is taken by something that is not a folder. */
  | 'unsafePath'
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

export const FOLDER_MODE = 0o775;
export const FILE_MODE = 0o664;
export const COVER_FILE = 'cover.jpg';
const EXTENSION = '.opus';
const MAX_NAME_BYTES = 120;
/** The most names tried: the plain one, then ` (2)` up to this. */
const MOST_NAMES = 20;
/** What ` (20).opus` adds to a file's stem. */
const SUFFIX_ROOM = Buffer.byteLength(` (${MOST_NAMES})${EXTENSION}`);

const UNSAFE = /[/\\:*?"<>|\0]/g;
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

function cutToBytes(name: string, limit: number): string {
  let kept = '';
  let bytes = 0;
  for (const char of name) {
    bytes += Buffer.byteLength(char);
    if (bytes > limit) break;
    kept += char;
  }
  return kept;
}

const trimmed = (name: string) => name.replace(/^[\s.]+/, '').replace(/[\s.]+$/, '');

/**
 * One path part: `/`, NUL and `\ : * ? " < > |` become a space, invisible characters go, leading
 * dots and trailing dots or spaces go, and it is cut to 120 bytes on a character boundary.
 */
export function songName(value: string, limit = MAX_NAME_BYTES): string {
  const clean = trimmed(
    value.normalize('NFC').replace(INVISIBLE, '').replace(UNSAFE, ' ').replace(/\s+/g, ' '),
  );
  const cut = trimmed(cutToBytes(clean, limit));
  if (cut === '') throw new SongRefused('unsafeName');
  return cut;
}

/** A song's place, each part already a safe name; `file` has no extension or suffix. */
export interface SongPlace {
  artist: string;
  album: string;
  file: string;
}

const two = (n: number) => String(n).padStart(2, '0');

export function songPlace(match: SongMatch): SongPlace {
  if (match.source === 'YouTube Music') {
    return {
      artist: songName(match.artists[0]?.name ?? match.artist),
      album: songName(match.album),
      file: songName(match.title, MAX_NAME_BYTES - SUFFIX_ROOM),
    };
  }
  const year = /^\d{4}/.exec(match.originalDate ?? match.date ?? '')?.[0];
  const before = year === undefined ? '' : `${year} - `;
  const number =
    match.discTotal > 1
      ? `${match.discNumber}-${two(match.trackNumber)} - `
      : `${two(match.trackNumber)} - `;
  return {
    artist: songName(match.albumArtist),
    album: `${before}${songName(match.album, MAX_NAME_BYTES - Buffer.byteLength(before))}`,
    file: `${number}${songName(match.title, MAX_NAME_BYTES - SUFFIX_ROOM - Buffer.byteLength(number))}`,
  };
}

/** The `YOUTUBE_MUSIC_ID` an Ogg Opus file carries, or null for any other file. */
export async function keptIdOf(path: string): Promise<string | null> {
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
      return tags.comments.find(({ key }) => key === YOUTUBE_MUSIC_ID)?.value ?? null;
    }
    return null;
  } catch {
    return null;
  } finally {
    await file.close();
  }
}

/** The artist's folder: one there under any case, else the new name. */
async function artistFolder(musicDir: string, artist: string): Promise<string> {
  const lower = artist.toLocaleLowerCase();
  const there = (await readdir(musicDir)).find((one) => one.toLocaleLowerCase() === lower);
  if (there === undefined) return artist;
  if (!(await lstat(join(musicDir, there))).isDirectory()) throw new SongRefused('unsafePath');
  return there;
}

const nameAt = (place: SongPlace, n: number) =>
  `${place.file}${n === 1 ? '' : ` (${n})`}${EXTENSION}`;

/** Where a song is in Music, as a path under it with `/` between parts. */
export interface PlacedSong {
  relPath: string;
  /** `placed` when this call linked it; `existing` when an earlier try had. */
  outcome: 'placed' | 'existing';
}

/** This song's own file, placed by an earlier try, or null when none is there. */
export async function findPlaced(
  musicDir: string,
  place: SongPlace,
  youtubeMusicId: string,
): Promise<PlacedSong | null> {
  const artist = await artistFolder(musicDir, place.artist);
  for (let n = 1; n <= MOST_NAMES; n += 1) {
    const relPath = posix.join(artist, place.album, nameAt(place, n));
    const there = await lstat(join(musicDir, relPath)).catch(() => null);
    if (there === null) return null;
    if (there.isFile() && (await keptIdOf(join(musicDir, relPath))) === youtubeMusicId) {
      return { relPath, outcome: 'existing' };
    }
  }
  return null;
}

/** Makes each missing folder from `root` down to `parts`, 0775. */
async function folders(root: string, parts: readonly string[]): Promise<void> {
  let at = root;
  for (const part of parts) {
    at = join(at, part);
    const there = await lstat(at).catch(() => null);
    if (there === null) {
      await mkdir(at).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      });
      await chmod(at, FOLDER_MODE);
    } else if (!there.isDirectory()) throw new SongRefused('unsafePath');
  }
}

export interface PlaceSongInput {
  musicDir: string;
  place: SongPlace;
  youtubeMusicId: string;
  /** The finished file in the staging folder; it is linked, and left for the caller to remove. */
  built: string;
  /** The cover, written as `cover.jpg` only when it is a JPEG. */
  cover: { mime: string; bytes: Buffer } | null;
  signal?: AbortSignal;
}

/** Links the built file into its place under the first free name, and the cover beside it. */
export async function placeSong(input: PlaceSongInput): Promise<PlacedSong> {
  const { musicDir, place, youtubeMusicId, built, cover, signal } = input;
  if (signal?.aborted) throw new SongRefused('timedOut');
  const artist = await artistFolder(musicDir, place.artist);
  await folders(musicDir, [artist, place.album]);
  await chmod(built, FILE_MODE);
  let placed: PlacedSong | null = null;
  for (let n = 1; n <= MOST_NAMES && placed === null; n += 1) {
    const relPath = posix.join(artist, place.album, nameAt(place, n));
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
  if (cover?.mime === 'image/jpeg') {
    await coverBeside(join(musicDir, artist, place.album), cover.bytes);
  }
  return placed;
}

/** `cover.jpg`, only where the album's folder has none; one there, or made meanwhile, stays. */
async function coverBeside(albumDir: string, bytes: Buffer): Promise<void> {
  const path = join(albumDir, COVER_FILE);
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: FILE_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return;
    await rm(path, { force: true });
    throw error;
  }
  await chmod(path, FILE_MODE);
}

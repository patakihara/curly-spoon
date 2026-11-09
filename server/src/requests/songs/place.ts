/**
 * Where a kept song goes in Music, and putting it there. The household's tidy form:
 * `<album artist>/<year> - <album>/<NN> - <title>.opus`, with a disc before the number only on a
 * release of several discs, no year or number where the match has none, and an artist folder there
 * under another case reused. An album's folder already there under the artist is filed into rather
 * than one made beside it: `<year> - <album>`, `<album> (<year>)` (and `<album> (<year> …)`, as in
 * `(2015 original Broadway cast)`) and `<album>`, in any case, the forms the household's library
 * holds (read live). Where the album's folder already holds a file of the same track number and
 * title, of any kind, the household has the song: nothing is added, and the request is answered by
 * that file.
 *
 * The file is built in the staging folder and hard linked into place, never renamed: a link refuses
 * a name that is taken, so no household file is ever replaced. A file there that carries this
 * song's `YOUTUBE_MUSIC_ID` is its own, placed by an earlier try of the same key, and is answered
 * as it is; any other name taken moves this one to ` (2)`, then on.
 *
 * Folders it makes are 0775 and the file 0664, set here as the server's umask would leave them
 * closed to Jellyfin's group, which writes its `.nfo` files beside them. Each folder is noted as made
 * before it is made, in the request's own state, so a try cut short between making a folder and
 * setting its mode has the next try set it; a folder someone else made is never touched. A placing
 * that fails takes away the folders it made, each only while empty. `cover.jpg` is written only into
 * an album folder this import made, and only where it has none.
 */
import { chmod, link, lstat, mkdir, open, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { oggPackets } from '../../music/opus/ogg.js';
import { searchFold } from '../../text/fold.js';
import { readOpusTagsPacket } from '../../music/opus/remux.js';
import type { SongMatch } from './match.js';
import { YOUTUBE_MUSIC_ID } from './tags.js';

export type SongRefusal =
  /** A name with nothing left once made safe. */
  | 'unsafeName'
  /** The staged stream is missing or wrong, and its song could not be staged again. */
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
  /** The album folder made when none is there for it. */
  album: string;
  /** The album's own name and year, by which a folder already there is known as its folder. */
  albumName: string;
  year: string | null;
  file: string;
  /** The track's number, as the file is named by (`03`, `2-03`), or null; and its title. */
  number: string | null;
  title: string;
}

const two = (n: number) => String(n).padStart(2, '0');

export function songPlace(match: SongMatch): SongPlace {
  if (match.source === 'YouTube Music') {
    const album = songName(match.album);
    const title = songName(match.title, MAX_NAME_BYTES - SUFFIX_ROOM);
    return {
      artist: songName(match.artists[0]?.name ?? match.artist),
      album,
      albumName: album,
      year: null,
      file: title,
      number: null,
      title,
    };
  }
  const year = /^\d{4}/.exec(match.originalDate ?? match.date ?? '')?.[0] ?? null;
  const before = year === null ? '' : `${year} - `;
  const albumName = songName(match.album, MAX_NAME_BYTES - Buffer.byteLength(before));
  const number =
    match.discTotal > 1 ? `${match.discNumber}-${two(match.trackNumber)}` : two(match.trackNumber);
  const title = songName(
    match.title,
    MAX_NAME_BYTES - SUFFIX_ROOM - Buffer.byteLength(`${number} - `),
  );
  return {
    artist: songName(match.albumArtist),
    album: `${before}${albumName}`,
    albumName,
    year,
    file: `${number} - ${title}`,
    number,
    title,
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

/** Words alone, folded: `Do I Wanna Know?` and the file name `Do I Wanna Know-` are one title. */
const words = (name: string) =>
  searchFold(name)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a folder's name is this album's: `<year> - <album>`, `<album> (<year>…)` or `<album>`. */
function isAlbumFolder(name: string, place: SongPlace): boolean {
  const album = escaped(searchFold(place.albumName));
  const year = place.year ?? '\\d{4}';
  const forms = new RegExp(
    `^(?:${year} - ${album}|${album} \\(${year}(?: [^)]*)?\\)|${album})$`,
    'u',
  );
  return forms.test(searchFold(name));
}

/** The song's folders, as they are in Music or would be made: the artist's, then the album's. */
export interface SongFolders {
  artist: string;
  album: string;
}

/** Where the song goes: the artist's and the album's folders already there, else new names. */
export async function songFolders(musicDir: string, place: SongPlace): Promise<SongFolders> {
  const artist = await artistFolder(musicDir, place.artist);
  const entries = await readdir(join(musicDir, artist), { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  const albums = entries
    .filter((entry) => entry.isDirectory() && isAlbumFolder(entry.name, place))
    .map(({ name }) => name)
    .sort();
  return { artist, album: albums.includes(place.album) ? place.album : (albums[0] ?? place.album) };
}

/** A file's track number and the titles its name may hold, or null for a name of no title. */
function trackOf(name: string): { number: string | null; titles: string[] } | null {
  const stem = name.replace(/\.[^.]*$/, '');
  if (stem === name || stem === '') return null;
  const numbered = /^(\d+(?:-\d+)?)\s*(?:\.-|[-._])?\s*(.+)$/u.exec(stem);
  if (numbered === null) return { number: null, titles: [stem] };
  const rest = numbered[2]!;
  return { number: numbered[1]!, titles: [rest, rest.split(' - ').at(-1)!, stem] };
}

/** Whether two track numbers are one: `3`, `03` and `1-03` are, on a release of one disc. */
function sameNumber(theirs: string, ours: string): boolean {
  const parts = (n: string) => n.split('-').map(Number);
  const [a, b] = [parts(theirs), parts(ours)];
  if (a.length === b.length) return a.every((n, i) => n === b[i]);
  return a.at(-1) === b.at(-1);
}

/**
 * The household's own file of this track in the album's folder: the same track number and title,
 * of any kind, or the same title for a song with no number. Null when there is none.
 */
export async function householdTrack(
  musicDir: string,
  folders: SongFolders,
  place: SongPlace,
): Promise<PlacedSong | null> {
  const albumDir = join(musicDir, folders.artist, folders.album);
  const entries = await readdir(albumDir, { withFileTypes: true }).catch(() => []);
  const title = words(place.title);
  for (const entry of entries
    .filter((one) => one.isFile())
    .sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const track = trackOf(entry.name);
    if (track === null || !track.titles.some((one) => words(one) === title)) continue;
    if (
      place.number !== null &&
      (track.number === null || !sameNumber(track.number, place.number))
    ) {
      continue;
    }
    return { relPath: posix.join(folders.artist, folders.album, entry.name), outcome: 'household' };
  }
  return null;
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
  folders: SongFolders,
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

/** The folders a placing made, under Music, as the request's state notes them; and noting more. */
export interface MadeFolders {
  made: readonly string[];
  note: (made: string[]) => void;
}

/**
 * Makes each missing folder from Music down to `parts`, 0775, noting each before it is made; sets
 * 0775 on one a try before made and noted but may not have set. Answers what it made, all told.
 */
async function folders(
  musicDir: string,
  parts: readonly string[],
  { made, note }: MadeFolders,
): Promise<string[]> {
  const ours = [...made];
  let at = '';
  for (const part of parts) {
    at = at === '' ? part : posix.join(at, part);
    const path = join(musicDir, at);
    const there = await lstat(path).catch(() => null);
    if (there !== null && !there.isDirectory()) throw new SongRefused('unsafePath');
    if (there === null) {
      if (!ours.includes(at)) {
        ours.push(at);
        note([...ours]);
      }
      const madeHere = await mkdir(path).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
          return false;
        },
      );
      if (!madeHere) {
        ours.splice(ours.indexOf(at), 1);
        note([...ours]);
        continue;
      }
    }
    if (ours.includes(at)) await chmod(path, FOLDER_MODE);
  }
  return ours;
}

/** Takes away the folders a failed placing made, deepest first, each only while empty. */
async function unmake(musicDir: string, { note }: MadeFolders, ours: string[]): Promise<void> {
  const left = [...ours];
  for (const at of [...ours].sort((a, b) => b.length - a.length)) {
    const gone = await rmdir(join(musicDir, at)).then(
      () => true,
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT',
    );
    if (gone) left.splice(left.indexOf(at), 1);
  }
  note(left);
}

export interface PlaceSongInput {
  musicDir: string;
  folders: SongFolders;
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
  const ours = await folders(musicDir, [at.artist, at.album], made);
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
    await unmake(musicDir, made, ours);
    throw error;
  }
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

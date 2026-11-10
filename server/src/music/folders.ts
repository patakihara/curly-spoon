/**
 * Where a track Auralis adds goes in Music, for a kept song and an album alike. The household's tidy
 * form: `<album artist>/<year> - <album>/<NN> - <title>.<ext>`, with a disc before the number only
 * on a release of several discs, and an artist folder there under another case reused. An album's
 * folder already there under the artist is filed into rather than one made beside it:
 * `<year> - <album>`, `<album> (<year>)` (and `<album> (<year> …)`, as in
 * `(2015 original Broadway cast)`) and `<album>`, in any case, the forms the household's library
 * holds (read live). Where the album's folder already holds a file of the same track number and
 * title, of any kind, the household has the track.
 *
 * Folders made here are 0775 and files 0664, set here as the server's umask would leave them closed
 * to Jellyfin's group, which writes its `.nfo` files beside them. Each folder is noted as made before
 * it is made, in the request's own state, so a try cut short between making a folder and setting its
 * mode has the next try set it; a folder someone else made is never touched. A placing that fails
 * takes away the folders it made, each only while empty.
 */
import { chmod, lstat, mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { searchFold } from '../text/fold.js';

export const FOLDER_MODE = 0o775;
export const FILE_MODE = 0o664;
export const COVER_FILE = 'cover.jpg';
/** The longest path part made, in bytes. */
export const MAX_NAME_BYTES = 120;

export type FolderRefusal =
  /** A name with nothing left once made safe. */
  | 'unsafeName'
  /** A name in the way that is not a folder. */
  | 'unsafePath';

/** A place in Music that will not be made: it fails the import. */
export class FolderRefused extends Error {
  override readonly name = 'FolderRefused';

  constructor(readonly reason: FolderRefusal) {
    super(`music folder refused: ${reason}`);
  }
}

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
 * dots and trailing dots or spaces go, and it is cut to `limit` bytes on a character boundary.
 */
export function musicName(value: string, limit = MAX_NAME_BYTES): string {
  const clean = trimmed(
    value.normalize('NFC').replace(INVISIBLE, '').replace(UNSAFE, ' ').replace(/\s+/g, ' '),
  );
  const cut = trimmed(cutToBytes(clean, limit));
  if (cut === '') throw new FolderRefused('unsafeName');
  return cut;
}

/** A two-digit track number. */
export const two = (n: number) => String(n).padStart(2, '0');

/** The number a file is named by: `03`, or `2-03` on a release of several discs. */
export const trackNumberName = (disc: number, track: number, discTotal: number) =>
  discTotal > 1 ? `${disc}-${two(track)}` : two(track);

/** An album's folders as wanted, each part a safe name. */
export interface AlbumPlace {
  artist: string;
  /** The album folder made when none is there for it. */
  album: string;
  /** The album's own name and year, by which a folder already there is known as its folder. */
  albumName: string;
  year: string | null;
}

/** The year of a date, or null. */
export const yearOf = (...dates: (string | null | undefined)[]): string | null =>
  dates.map((date) => /^\d{4}/.exec(date ?? '')?.[0]).find((year) => year !== undefined) ?? null;

/** The folders of an album by an artist, from its year: `<year> - <album>`, or `<album>`. */
export function albumPlace(artist: string, album: string, year: string | null): AlbumPlace {
  const before = year === null ? '' : `${year} - `;
  const albumName = musicName(album, MAX_NAME_BYTES - Buffer.byteLength(before));
  return { artist: musicName(artist), album: `${before}${albumName}`, albumName, year };
}

/** The artist's folder: one there under any case, else the new name. */
async function artistFolder(musicDir: string, artist: string): Promise<string> {
  const lower = artist.toLocaleLowerCase();
  const there = (await readdir(musicDir)).find((one) => one.toLocaleLowerCase() === lower);
  if (there === undefined) return artist;
  if (!(await lstat(join(musicDir, there))).isDirectory()) throw new FolderRefused('unsafePath');
  return there;
}

/** Words alone, folded: `Do I Wanna Know?` and the file name `Do I Wanna Know-` are one title. */
const words = (name: string) =>
  searchFold(name)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether a folder's name is this album's: `<year> - <album>`, `<album> (<year>…)` or `<album>`. */
function isAlbumFolder(name: string, place: AlbumPlace): boolean {
  const album = escaped(searchFold(place.albumName));
  const year = place.year ?? '\\d{4}';
  const forms = new RegExp(
    `^(?:${year} - ${album}|${album} \\(${year}(?: [^)]*)?\\)|${album})$`,
    'u',
  );
  return forms.test(searchFold(name));
}

/** An album's folders, as they are in Music or would be made: the artist's, then the album's. */
export interface AlbumFolders {
  artist: string;
  album: string;
}

/** The artist's folder, and every folder of the album already there under it, in name order. */
async function foldersThere(
  musicDir: string,
  place: AlbumPlace,
): Promise<{ artist: string; albums: string[] }> {
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
  return { artist, albums };
}

/** Where an album's tracks go: the artist's and the album's folders already there, else new names. */
export async function albumFolders(musicDir: string, place: AlbumPlace): Promise<AlbumFolders> {
  const { artist, albums } = await foldersThere(musicDir, place);
  return { artist, album: albums.includes(place.album) ? place.album : (albums[0] ?? place.album) };
}

/** Every folder of the album already in Music, in any of the household's forms. */
export async function everyAlbumFolder(
  musicDir: string,
  place: AlbumPlace,
): Promise<AlbumFolders[]> {
  const { artist, albums } = await foldersThere(musicDir, place);
  return albums.map((album) => ({ artist, album }));
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

/** A track as a file is named for it: its number (`03`, `2-03`) or null, and its title. */
export interface TrackName {
  number: string | null;
  title: string;
}

/**
 * The files in the album's folder of this track: the same track number and title, of any kind, or
 * the same title for a track with no number; each as a path under Music, in name order.
 */
export async function filesOfTrack(
  musicDir: string,
  folders: AlbumFolders,
  track: TrackName,
): Promise<string[]> {
  const albumDir = join(musicDir, folders.artist, folders.album);
  const entries = await readdir(albumDir, { withFileTypes: true }).catch(() => []);
  const title = words(track.title);
  return entries
    .filter((one) => one.isFile())
    .map(({ name }) => name)
    .sort()
    .filter((name) => {
      const named = trackOf(name);
      if (named === null || !named.titles.some((one) => words(one) === title)) return false;
      return (
        track.number === null || (named.number !== null && sameNumber(named.number, track.number))
      );
    })
    .map((name) => posix.join(folders.artist, folders.album, name));
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
export async function makeFolders(
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
    if (there !== null && !there.isDirectory()) throw new FolderRefused('unsafePath');
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
export async function unmakeFolders(
  musicDir: string,
  { note }: MadeFolders,
  ours: readonly string[],
): Promise<void> {
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

/** `cover.jpg`, only where the album's folder has none; one there, or made meanwhile, stays. */
export async function coverBeside(albumDir: string, bytes: Buffer): Promise<void> {
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

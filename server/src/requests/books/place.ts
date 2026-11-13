/**
 * Puts a finished torrent's book in Books, as `audiobook-import` and its hand fixes did. Each kept
 * file is hard linked into a staging folder beside the download, `metadata.json` joins them, and one
 * `rename` is the only commit: Audiobookshelf's watcher never sees half a book, a failure or an abort
 * leaves nothing in Books, and the torrent goes on seeding the same bytes. No file is ever copied or
 * moved: a link that fails fails the import. Each attempt has its own staging folder under the key,
 * so what a crash left is cleared and an attempt still running is not touched.
 *
 * A book already there is left untouched and the request answers it: Bookshelf grabs editions on its
 * own. A shape that is not plainly one book fails by name, never guessing what belongs together.
 */
import { randomBytes } from 'node:crypto';
import {
  link as linkFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
} from 'node:fs/promises';
import { dirname, extname, join, sep } from 'node:path';
import type { QbitFile } from '../../adapters/qbittorrent/schemas.js';
import type { JobLog } from '../../jobs/schedule.js';
import { type BookMetadata, writeMetadata } from './metadata.js';
import { BookRefused, lastNameOf, safeFileName, safeName, sameName } from './names.js';
import { type Copy, markCopies, otherCopies, seriesFor, UNKNOWN_NARRATOR } from './narrators.js';

const AUDIO = new Set([
  '.mp3',
  '.m4b',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.wma',
  '.wav',
]);
/** One audio file each, usually: more than one in a folder is more than one book or its parts. */
const WHOLE_BOOK = new Set(['.m4b', '.m4a']);
const KEPT_EXTRAS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.cue']);
const DISC = /(?:^|[\s._-])(?:disc|disk|cd|part|pt|volume|vol|tape)[\s._-]*\d+$|^\d+$/i;
const STAGING = '.auralis-import';
const MAX_NAME_BYTES = 120;
/** The staging folders of the attempts running now; any other under a key was left by a crash. */
const liveStaging = new Set<string>();

export interface BookToPlace {
  title: string;
  authors: string[];
  narrators: string[];
  series: string[];
  year: number | null;
  asin: string | null;
  language: string | null;
  description: string | null;
  bitrateKbps: number | null;
}

export interface PlaceBookInput {
  /** The folder holding both `Books` and `Downloads`, so a link stays on one mount. */
  mediaDir: string;
  /** The torrent's save path, as seen from here. */
  savePath: string;
  /** The torrent's files, relative to it, as qBittorrent lists them. */
  files: Pick<QbitFile, 'name' | 'size'>[];
  key: string;
  book: BookToPlace;
  log?: JobLog;
  link?: (from: string, to: string) => Promise<void>;
  /** Aborted when the step's time limit passes; honoured up to the rename, and never after it. */
  signal?: AbortSignal;
}

/** Where the book is, and whether this import put it there (or an earlier call of the same key). */
export interface PlacedBook {
  outcome: 'placed' | 'existing';
  /** Its folder under Books, as Audiobookshelf's `relPath` says it. */
  relPath: string;
  authorDir: string;
}

interface PlannedLink {
  source: string;
  target: string[];
  /** The bytes qBittorrent lists for audio, which must be there; null for any other file. */
  audioSize: number | null;
}

/** A torrent's own path split in parts, refusing any that could lead out of where it is put. */
function pathParts(name: string): string[] {
  if (name.includes('\0') || name.includes('\\') || name.startsWith('/')) {
    throw new BookRefused('unsafePath');
  }
  const parts = name.split('/');
  for (const part of parts) {
    const seen = part.normalize('NFKC');
    if (part === '' || part === '.' || seen === '..' || seen.includes('/') || seen.includes('\\')) {
      throw new BookRefused('unsafePath');
    }
  }
  return parts;
}

const extensionOf = (name: string) => extname(name).toLowerCase();
const folderOf = (parts: readonly string[]) => parts.slice(0, -1).join('/');

/** The audio's shared top folders, which name the torrent rather than any part of the book. */
function sharedRoot(audio: readonly string[][]): number {
  let depth = 0;
  const first = audio[0] as string[];
  while (
    depth < first.length - 1 &&
    audio.every((parts) => parts.length - 1 > depth && parts[depth] === first[depth])
  ) {
    depth += 1;
  }
  return depth;
}

/** Refuses audio that is not plainly one book, once its shared root is gone. */
function checkOneBook(audio: readonly string[][]): void {
  const extensions = new Set(audio.map((parts) => extensionOf(parts.at(-1) as string)));
  if (extensions.size > 1) throw new BookRefused('severalFormats');
  if (audio.some((parts) => parts.length > 2)) throw new BookRefused('unexpectedLayout');
  const folders = new Set(
    audio.filter((parts) => parts.length === 2).map((parts) => parts[0] as string),
  );
  const loose = audio.some((parts) => parts.length === 1);
  if (folders.size > 0) {
    if (loose) throw new BookRefused('unexpectedLayout');
    const discs = [...folders].filter((folder) => DISC.test(folder));
    if (discs.length === 0) throw new BookRefused('severalBooks');
    if (discs.length !== folders.size) throw new BookRefused('unexpectedLayout');
    return;
  }
  const [extension] = extensions;
  if (WHOLE_BOOK.has(extension as string)) {
    const stems = new Set(
      audio.map((parts) => (parts[0] as string).replace(/\.[^.]*$/, '').replace(/\d+/g, '')),
    );
    if (stems.size > 1) throw new BookRefused('severalBooks');
  }
}

/** What links where: audio, and the covers and cue sheets beside it. Everything else stays behind. */
function planLinks(files: readonly Pick<QbitFile, 'name' | 'size'>[]): PlannedLink[] {
  const parsed = files.map(({ name, size }) => ({ name, size, parts: pathParts(name) }));
  const visible = parsed.filter(({ parts }) => !parts.some((part) => part.startsWith('.')));
  const audio = visible.filter(({ name }) => AUDIO.has(extensionOf(name)));
  if (audio.length === 0) throw new BookRefused('noAudio');
  const root = sharedRoot(audio.map(({ parts }) => parts));
  const relative = audio.map(({ parts }) => parts.slice(root));
  checkOneBook(relative);
  const audioFolders = new Set(relative.map(folderOf));
  const rootPath = (audio[0] as (typeof audio)[number]).parts.slice(0, root).join('/');
  const extras = visible.filter(({ name, parts }) => {
    if (!KEPT_EXTRAS.has(extensionOf(name))) return false;
    if (parts.length <= root || parts.slice(0, root).join('/') !== rootPath) return false;
    const folder = folderOf(parts.slice(root));
    return folder === '' || audioFolders.has(folder);
  });
  const planned = [...audio, ...extras].map(({ name, size, parts }) => ({
    source: name,
    audioSize: AUDIO.has(extensionOf(name)) ? size : null,
    target: parts
      .slice(root)
      .map((part, at, all) => (at === all.length - 1 ? safeFileName(part) : safeName(part))),
  }));
  const targets = new Set(planned.map(({ target }) => target.join('/')));
  if (targets.size !== planned.length) throw new BookRefused('unexpectedLayout');
  return planned;
}

/** Each file a plain file inside the save path, or the import stops before it makes anything. */
async function checkSources(savePath: string, plan: readonly PlannedLink[]): Promise<void> {
  const inside = await realpath(savePath);
  for (const { source, audioSize } of plan) {
    const path = join(savePath, source);
    const stat = await lstat(path).catch(() => null);
    if (stat === null || !stat.isFile()) throw new BookRefused('notARegularFile');
    if (!(await realpath(path)).startsWith(`${inside}${sep}`)) throw new BookRefused('unsafePath');
    if (audioSize !== null && (stat.size === 0 || stat.size < audioSize)) {
      throw new BookRefused('noAudioBytes');
    }
  }
}

/** The author's folder: one there under any case, else a new name. A link is refused. */
export async function authorFolder(booksDir: string, author: string): Promise<string> {
  const name = safeName(author);
  const there = (await readdir(booksDir)).find((one) => sameName(one, name));
  if (there === undefined) return name;
  const stat = await lstat(join(booksDir, there));
  if (!stat.isDirectory()) throw new BookRefused('unsafePath');
  return there;
}

export function narratorMark(narrators: readonly string[]): string {
  const [first] = narrators;
  return (first === undefined ? null : lastNameOf(first)) ?? UNKNOWN_NARRATOR;
}

/** `1994 - Title (LastName) 64k`, with the bitrate left out if unknown, within the name's cap. */
export function bookFolder(book: BookToPlace): string {
  const before = book.year === null ? '' : `${book.year} - `;
  const bitrate = book.bitrateKbps === null ? '' : ` ${book.bitrateKbps}k`;
  const after = ` (${safeName(narratorMark(book.narrators))})${bitrate}`;
  const room = MAX_NAME_BYTES - Buffer.byteLength(before) - Buffer.byteLength(after);
  return `${before}${safeName(book.title, room)}${after}`;
}

const isSameFile = async (a: string, b: string) => {
  const [one, other] = await Promise.all([lstat(a), lstat(b).catch(() => null)]);
  return other !== null && one.ino === other.ino && one.dev === other.dev;
};

const honourAbort = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) throw new BookRefused('timedOut');
};

async function stagedFolder(
  input: PlaceBookInput,
  plan: readonly PlannedLink[],
  copies: readonly Copy[],
  staging: string,
  authorDir: string,
): Promise<void> {
  const { book, savePath, signal } = input;
  const link = input.link ?? linkFile;
  await mkdir(staging, { recursive: true });
  for (const { source, target } of plan) {
    honourAbort(signal);
    const to = join(staging, ...target);
    await mkdir(dirname(to), { recursive: true });
    await link(join(savePath, source), to);
  }
  const mark = narratorMark(book.narrators);
  const title =
    copies.length > 0 && mark !== UNKNOWN_NARRATOR ? `${book.title} [${mark}]` : book.title;
  const metadata: BookMetadata = {
    title,
    authors: book.authors,
    narrators: book.narrators,
    series: await seriesFor(authorDir, copies, book.series),
    publishedYear: book.year === null ? null : String(book.year),
    asin: book.asin,
    language: book.language,
    description: book.description,
    tags: [],
    genres: [],
  };
  await writeMetadata(staging, metadata);
}

/** What a crash left under this key. An attempt running now keeps its own folder. */
async function clearLeftovers(keyDir: string): Promise<void> {
  const entries = await readdir(keyDir).catch(() => []);
  for (const entry of entries) {
    const path = join(keyDir, entry);
    if (!liveStaging.has(path)) await rm(path, { recursive: true, force: true });
  }
}

/** The one commit. A folder that appeared meanwhile is someone else's: it stays and this fails. */
async function commit(staging: string, target: string, signal?: AbortSignal): Promise<void> {
  const there = await lstat(target).catch(() => null);
  if (there !== null) throw new BookRefused('folderAppeared');
  honourAbort(signal);
  await rename(staging, target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') {
      throw new BookRefused('folderAppeared');
    }
    throw error;
  });
}

/** Staging, on Books' own filesystem, and then one rename. Anything that fails leaves nothing. */
async function putInPlace(
  input: PlaceBookInput,
  plan: readonly PlannedLink[],
  copies: readonly Copy[],
  authorDir: string,
  target: string,
): Promise<void> {
  const stagingRoot = join(input.mediaDir, 'Downloads', STAGING);
  const keyDir = join(stagingRoot, safeName(input.key));
  const staging = join(keyDir, randomBytes(6).toString('hex'));
  liveStaging.add(staging);
  const madeAuthor = await lstat(authorDir).then(
    () => false,
    () => true,
  );
  try {
    await clearLeftovers(keyDir);
    await stagedFolder(input, plan, copies, staging, authorDir);
    await mkdir(authorDir, { recursive: true });
    await commit(staging, target, input.signal);
  } catch (error) {
    if (madeAuthor) await rmdir(authorDir).catch(() => undefined);
    if (error instanceof BookRefused) throw error;
    input.log?.error({ code: (error as NodeJS.ErrnoException).code }, 'a book could not be linked');
    throw new BookRefused('linkFailed');
  } finally {
    liveStaging.delete(staging);
    await rm(staging, { recursive: true, force: true });
    await rmdir(keyDir).catch(() => undefined);
    await rmdir(stagingRoot).catch(() => undefined);
  }
}

/** The relPath a book has, or would have, under Books. */
export async function bookDestination(mediaDir: string, book: BookToPlace) {
  const booksDir = join(mediaDir, 'Books');
  const [author] = book.authors;
  if (author === undefined) throw new BookRefused('noAuthor');
  const authorName = await authorFolder(booksDir, author);
  const folder = bookFolder(book);
  return {
    authorName,
    folder,
    authorDir: join(booksDir, authorName),
    target: join(booksDir, authorName, folder),
  };
}

export async function placeBook(input: PlaceBookInput): Promise<PlacedBook> {
  const { book, savePath, mediaDir, log } = input;
  const plan = planLinks(input.files);
  await checkSources(savePath, plan);
  const { authorName, folder, authorDir, target } = await bookDestination(mediaDir, book);
  const relPath = `${authorName}/${folder}`;
  const copies = await otherCopies(authorDir, book.title, folder);

  const stat = await lstat(target).catch(() => null);
  if (stat !== null) {
    const [first] = plan as [PlannedLink];
    const ours = await isSameFile(join(savePath, first.source), join(target, ...first.target));
    if (!ours) return { outcome: 'existing', relPath, authorDir };
  } else {
    const mark = narratorMark(book.narrators);
    const same = copies.find(({ narrator }) => {
      const held = narrator === null ? null : lastNameOf(narrator);
      return held !== null && mark !== UNKNOWN_NARRATOR && sameName(held, mark);
    });
    if (same !== undefined) {
      return { outcome: 'existing', relPath: `${authorName}/${same.folder}`, authorDir };
    }
    await putInPlace(input, plan, copies, authorDir, target);
  }
  await markCopies(authorDir, book.title, copies, log);
  return { outcome: 'placed', relPath, authorDir };
}

/**
 * Names on the shelf: every folder and file name a book's import makes goes through `safeName`, as a
 * title is an upstream's text and a torrent's file names are anyone's. And why an import refuses,
 * each by name, rather than guess.
 */
export type RefusalReason =
  /** A name with nothing left once made safe. */
  | 'unsafeName'
  /** A path from the torrent, or a folder on the way, that leads outside where it should. */
  | 'unsafePath'
  /** A file in the download that is a link or anything else but a file. */
  | 'notARegularFile'
  /** A torrent with no audio in it. */
  | 'noAudio'
  /** A torrent holding more than one book. */
  | 'severalBooks'
  /** The same book in more than one audio format, which cannot be told from two books. */
  | 'severalFormats'
  /** Folders in a shape that is neither one book nor one book's discs. */
  | 'unexpectedLayout'
  /** A hard link that failed. It is never replaced by a copy. */
  | 'linkFailed'
  /** The torrent saved somewhere other than Downloads. */
  | 'outsideDownloads'
  /** The torrent is gone, and its book is not there. */
  | 'torrentGone'
  /** The torrent has files still to come. */
  | 'notComplete'
  /** A book whose author nothing names. */
  | 'noAuthor'
  /** No Audiobookshelf library holds a `Books` folder. */
  | 'noBooksLibrary'
  /** The library has no watcher, so nothing would ever pick up the folder. */
  | 'watcherOff';

/** An import that will not go on. It fails the request, and its message goes to the job's log. */
export class BookRefused extends Error {
  override readonly name = 'BookRefused';

  constructor(readonly reason: RefusalReason) {
    super(`book import refused: ${reason}`);
  }
}

const MAX_NAME_BYTES = 120;
const MAX_EXTENSION_BYTES = 16;
/** Control, format (bidi, zero width), line and paragraph separator characters. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const SLASHES = /[/\\⁄∕⧸]/g;
const COLON = /\s*:\s*/g;
const UNWELCOME = /[*?"<>|]/g;

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

const trimmed = (name: string) => name.replace(/^[\s.-]+/, '').replace(/[\s.]+$/, '');

/** A name that is one folder level and no more. Refuses one with nothing left. */
export function safeName(value: string, limit = MAX_NAME_BYTES): string {
  const clean = trimmed(
    value
      .normalize('NFKC')
      .replace(INVISIBLE, '')
      .replace(SLASHES, '-')
      .replace(COLON, ' - ')
      .replace(UNWELCOME, '')
      .replace(/\.{2,}/g, '.')
      .replace(/\s+/g, ' '),
  );
  const cut = trimmed(cutToBytes(clean, limit));
  if (cut === '') throw new BookRefused('unsafeName');
  return cut;
}

/** The same for a file: the name and its extension, within the same cap. */
export function safeFileName(value: string): string {
  const dot = value.lastIndexOf('.');
  const extension = dot <= 0 ? '' : safeName(value.slice(dot + 1), MAX_EXTENSION_BYTES);
  const stem = dot <= 0 ? value : value.slice(0, dot);
  if (extension === '') return safeName(stem);
  return `${safeName(stem, MAX_NAME_BYTES - Buffer.byteLength(extension) - 1)}.${extension}`;
}

const PARTICLES = new Set(['de', 'le', 'van', 'von', 'del', 'la', 'di', 'du', 'den', 'der']);
const capitalised = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

/** A narrator's last name, with a particle if it has one; null when the value looks like garbage. */
export function lastNameOf(narrator: string): string | null {
  const words = narrator.trim().split(/\s+/);
  const last = words.at(-1);
  if (!last || /\d/.test(narrator)) return null;
  const before = words.at(-2);
  return before !== undefined && PARTICLES.has(before.toLowerCase())
    ? `${capitalised(before.toLowerCase())} ${last}`
    : last;
}

/** What a folder name says: `1994 - Title (Narrator) 64k ...`, each part but the title optional. */
export function parseFolder(folder: string): { title: string; narrator: string | null } {
  const withoutYear = folder.replace(/^\d{4} - /, '');
  const parts = /^(.+) \(([^()]*)\)(?: [^()]*)?$/.exec(withoutYear);
  return parts
    ? { title: parts[1] as string, narrator: parts[2] as string }
    : { title: withoutYear, narrator: null };
}

/** A title to compare with, without case, marks, punctuation or a narrator's bracket. */
export function normalTitle(title: string): string {
  return title
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

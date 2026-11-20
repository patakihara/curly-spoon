/**
 * The name Audiobookshelf gives an episode's file when it downloads one itself: a port of its
 * `PodcastEpisodeDownload.getSanitizedFilename` and `fileUtils.sanitizeFilename` (2.38.0). A stub
 * must carry exactly this name, so an episode already on disk, a stub or ABS's own download, is
 * found by name and never stubbed twice.
 */
import { basename, extname } from 'node:path';

/** ABS's `globals.SupportedAudioTypes`: an enclosure's extension outside this list becomes mp3. */
const SUPPORTED_AUDIO_TYPES = new Set([
  'm4b',
  'mp3',
  'm4a',
  'flac',
  'opus',
  'ogg',
  'oga',
  'mp4',
  'aac',
  'wma',
  'aiff',
  'aif',
  'wav',
  'webm',
  'webma',
  'mka',
  'awb',
  'caf',
  'mpg',
  'mpeg',
]);

const MAX_FILENAME_BYTES = 255;
const ILLEGAL = /[/?<>\\:*|"]/g;
// eslint-disable-next-line no-control-regex -- ABS strips exactly these.
const CONTROL = /[\x00-\x1f\x80-\x9f]/g;
const RESERVED = /^\.+$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
const WINDOWS_TRAILING = /[. ]+$/;
const LINE_BREAKS = /[\n\r]/g;

/**
 * ABS's `sanitizeFilename`: the first colon becomes ` - `, and the name fits 255 UTF-16 bytes.
 * `trimCut: false` is the old stubgen's cut, which kept a space left at the end of a cut title.
 */
export function sanitizeFilename(
  filename: string,
  colonReplacement = ' - ',
  { trimCut = true }: { trimCut?: boolean } = {},
): string {
  const sanitized = filename
    .normalize('NFC')
    .replace(':', colonReplacement)
    .replace(ILLEGAL, '')
    .replace(CONTROL, '')
    .replace(RESERVED, '')
    .replace(LINE_BREAKS, '')
    .replace(WINDOWS_RESERVED, '')
    .replace(WINDOWS_TRAILING, '')
    .replace(/\s+/g, ' ');

  const ext = extname(sanitized);
  const base = basename(sanitized, ext);
  const extBytes = Buffer.byteLength(ext, 'utf16le');
  if (Buffer.byteLength(base, 'utf16le') + extBytes <= MAX_FILENAME_BYTES) return sanitized;

  const maxBaseBytes = MAX_FILENAME_BYTES - extBytes;
  let total = 0;
  let trimmed = '';
  for (const char of base) {
    total += Buffer.byteLength(char, 'utf16le');
    if (total > maxBaseBytes) break;
    trimmed += char;
  }
  return (trimCut ? trimmed.trim() : trimmed) + ext;
}

/** The enclosure URL as ABS keeps it: encoded once, whether or not the feed encoded it. */
function absUrl(url: string): string {
  try {
    return decodeURIComponent(url) !== url ? url : encodeURI(url);
  } catch {
    // A stray `%` makes ABS's own decode throw; the extension is read from the URL as given.
    return url;
  }
}

/** The extension ABS downloads an enclosure under: the URL's own, when ABS plays it, else mp3. */
function fileExtension(enclosureUrl: string): string {
  const clean = absUrl(enclosureUrl).split('?')[0] ?? '';
  const ext = extname(clean).substring(1).toLowerCase();
  return SUPPORTED_AUDIO_TYPES.has(ext) ? ext : 'mp3';
}

/**
 * The file name ABS gives a fresh download of this feed item: its title, trimmed, with the
 * enclosure's extension, sanitized. Can be empty (a title of `con`); the caller skips such an item.
 */
export function episodeFilename(title: string | null | undefined, enclosureUrl: string): string {
  return sanitizeFilename(`${(title ?? '').trim()}.${fileExtension(enclosureUrl)}`);
}

/**
 * Every name this feed item's file may already have on disk: ABS's own (the one a new stub is
 * written under) first, then the old stubgen's when it differs (a long title cut just after a
 * space, which kept the space: `… .mp3`). Empty when the sanitized name is empty.
 */
export function episodeFilenames(title: string | null | undefined, enclosureUrl: string): string[] {
  const raw = `${(title ?? '').trim()}.${fileExtension(enclosureUrl)}`;
  const name = sanitizeFilename(raw);
  if (name === '' || name.startsWith('.')) return [];
  const old = sanitizeFilename(raw, ' - ', { trimCut: false });
  return old === name ? [name] : [name, old];
}

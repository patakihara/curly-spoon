/**
 * Picking a book's release from what the indexers list. Listed seeders can be false (timing: five of
 * five listed swarms gave nothing), so what counts is that the row is this book, in the reading the
 * catalogue names and a sensible format and bitrate. Seeders only break a tie, and only none against
 * some. A row that is plainly something else is rejected; a row that may be the book with more in it
 * is kept, but only a person can choose it.
 */
import type { DetailExtras } from '../../adapters/audiobookbay/parse.js';
import type { ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import { infoHashFromMagnet } from '../download/torrentId.js';

/** What the catalogue says of the book. Without a product, only the request's title and author. */
export interface BookFacts {
  title: string;
  authors: string[];
  narrators: string[];
  runtimeMinutes: number | null;
  language: string | null;
}

export interface PickRow {
  release: ProwlarrRelease;
  extras: DetailExtras;
}

export type PickOutcome =
  | { kind: 'picked'; best: PickRow; others: PickRow[] }
  | { kind: 'choose'; rows: PickRow[] }
  | { kind: 'none' };

/** The most a picked release takes along for when it fails. */
export const MAX_OTHERS = 3;
const MIN_KBPS = 8;
const MAX_KBPS = 5 * 128;
const BEST_KBPS = { low: 64, high: 128 };

const SMALL_WORDS = new Set(['a', 'an', 'and', 'of', 'the', 'in', 'on', 'to', 'for']);
const NOTE_WORDS = new Set(['audiobook', 'audio', 'book', 'by', 'unabridged', 'read']);
const EBOOK = /\b(?:epub|mobi|azw3?|pdf|ebook)\b/i;
/** More or less than the one book, as a title or its notes say. */
const NOT_ONE_BOOK =
  /(?<![\w-])abridged\b|\bbox(?:ed)?[\s-]*set\b|\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\b|\bbooks\s+\d|\bomnibus\b|\btrilogy\b|\bcollection\b/;

const plain = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .toLowerCase();
const words = (text: string) =>
  plain(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Every language's one-word name, in English or in itself, to its English name. */
const LANGUAGES = new Map(
  Object.entries({
    bengali: 'bangla',
    cantonese: 'chinese',
    castellano: 'spanish',
    farsi: 'persian',
    flemish: 'dutch',
    mandarin: 'chinese',
  }),
);
const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];
for (const code of LETTERS.flatMap((one) => LETTERS.map((two) => `${one}${two}`))) {
  const nameIn = (locale: string) => new Intl.DisplayNames([locale], { type: 'language' }).of(code);
  const english = plain(nameIn('en') ?? code);
  if (english !== code && words(english).length === 1) {
    LANGUAGES.set(english, english);
    const own = words(nameIn(code) ?? code);
    if (own.length === 1) LANGUAGES.set(own[0] as string, english);
  }
}
const languageOf = (name: string) => LANGUAGES.get(plain(name)) ?? plain(name);

/** A row's title without its bracketed notes: format, bitrate, publisher. */
const withoutNotes = (title: string) => title.replace(/\[[^[\]]*\]|\([^()]*\)/g, ' ');
const notesOf = (title: string) =>
  [...title.matchAll(/\[([^[\]]*)\]|\(([^()]*)\)/g)].map((m) => m[1] ?? m[2] ?? '').join(' ');

const surname = (author: string) => words(author).at(-1);

function kbpsBySize(size: number | null, facts: BookFacts): number | null {
  if (size === null || facts.runtimeMinutes === null || facts.runtimeMinutes <= 0) return null;
  return (size * 8) / 1000 / (facts.runtimeMinutes * 60);
}

/** Whether the row is plainly not this book, in this language, as audio of about this length. */
function rejected({ release, extras }: PickRow, facts: BookFacts): boolean {
  if (EBOOK.test(release.title) || EBOOK.test(extras.format ?? '')) return true;
  const all = new Set(words(release.title));
  const needed = words(facts.title).filter((word) => !SMALL_WORDS.has(word));
  if (needed.some((word) => !all.has(word))) return true;
  const surnames = facts.authors.map(surname).filter((name) => name !== undefined);
  if (surnames.length > 0 && !surnames.some((name) => all.has(name))) return true;
  if (facts.language !== null) {
    const wanted = languageOf(facts.language);
    const said = words(notesOf(release.title)).flatMap((word) => LANGUAGES.get(word) ?? []);
    if (said.length > 0 && !said.includes(wanted)) return true;
  }
  const kbps = kbpsBySize(release.size, facts);
  return kbps !== null && (kbps < MIN_KBPS || kbps > MAX_KBPS);
}

/** Whether the words come in this order among `said`, with others between them or not. */
function inOrder(wanted: string[], said: string[]): boolean {
  let from = 0;
  for (const word of wanted) {
    const at = said.indexOf(word, from);
    if (at === -1) return false;
    from = at + 1;
  }
  return true;
}

const isInitial = (word: string) => /^\p{L}$/u.test(word);

/** Whether the row's title says nothing but the book, in its own word order, and its author. */
function exactly({ release }: PickRow, facts: BookFacts): boolean {
  if (NOT_ONE_BOOK.test(plain(release.title)) && !NOT_ONE_BOOK.test(plain(facts.title))) {
    return false;
  }
  const said = words(withoutNotes(release.title));
  const known = new Set([...words(facts.title), ...facts.authors.flatMap(words), ...NOTE_WORDS]);
  const needed = words(facts.title).filter((word) => !SMALL_WORDS.has(word));
  return inOrder(needed, said) && said.every((word) => known.has(word) || isInitial(word));
}

/** The bitrate its page or title says, or else what its size works out at; null if none of those. */
function kbpsOf({ release, extras }: PickRow, facts: BookFacts): number | null {
  if (extras.bitrateKbps !== undefined) return extras.bitrateKbps;
  const said = /(\d{1,4})\s*kbps/i.exec(release.title)?.[1];
  return said === undefined ? kbpsBySize(release.size, facts) : Number(said);
}

/** How far from the wanted bitrate; an unknown one counts as a little off. */
function bitrateDistance(row: PickRow, facts: BookFacts): number {
  const kbps = kbpsOf(row, facts);
  if (kbps === null) return 1;
  return Math.max(0, BEST_KBPS.low - kbps, kbps - BEST_KBPS.high);
}

function score(row: PickRow, facts: BookFacts): number[] {
  const wanted = new Set(facts.narrators.map(plain));
  const read = (row.extras.narrators ?? []).some((name) => wanted.has(plain(name)));
  const format = row.extras.format ?? row.release.title;
  return [
    exactly(row, facts) ? 1 : 0,
    read ? 1 : 0,
    /m4b/i.test(format) ? 1 : 0,
    -bitrateDistance(row, facts),
    row.release.seeders === 0 ? 0 : 1,
  ];
}

function compare(a: number[], b: number[]): number {
  for (const [place, value] of a.entries()) {
    const difference = (b[place] ?? 0) - value;
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The torrent's info hash, if the row names one. */
function hashOf({ release, extras }: PickRow): string | null {
  const { infoHash, magnet } = release.details;
  const named =
    extras.infoHash ?? infoHash ?? (magnet === undefined ? null : infoHashFromMagnet(magnet));
  return named === null ? null : named.toLowerCase();
}

/**
 * The rows that may be the book, the likeliest first, in the order given among equals. The same
 * torrent listed twice counts once, as its likeliest row.
 */
export function rankRows(rows: readonly PickRow[], facts: BookFacts): PickRow[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => !rejected(row, facts))
    .map((row) => ({ row, scored: score(row, facts) }))
    .sort((a, b) => compare(a.scored, b.scored))
    .map(({ row }) => row)
    .filter((row) => {
      const hash = hashOf(row);
      if (hash === null) return true;
      if (seen.has(hash)) return false;
      seen.add(hash);
      return true;
    });
}

export function pickRelease(rows: readonly PickRow[], facts: BookFacts): PickOutcome {
  const ranked = rankRows(rows, facts);
  const [best, ...rest] = ranked;
  if (best === undefined) return { kind: 'none' };
  if (!exactly(best, facts)) return { kind: 'choose', rows: ranked };
  const others = rest.filter((row) => exactly(row, facts)).slice(0, MAX_OTHERS);
  return { kind: 'picked', best, others };
}

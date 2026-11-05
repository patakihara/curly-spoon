/**
 * Picking a book's release from what the indexers list. Listed seeders can be false (timing: five of
 * five listed swarms gave nothing), so what counts is that the row is this book, in the reading the
 * catalogue names and a sensible format and bitrate. Seeders only break a tie, and only none against
 * some. A row that is plainly something else is rejected; a row that may be the book with more in it
 * is kept, but only a person can choose it.
 */
import type { DetailExtras } from '../../adapters/audiobookbay/parse.js';
import type { ProwlarrRelease } from '../../adapters/prowlarr/client.js';

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
const LANGUAGES =
  /\b(english|spanish|espanol|german|deutsch|french|francais|italian|russian|portuguese|dutch|polish|japanese|chinese|finnish|swedish)\b/;
const SAME_LANGUAGE: Record<string, string> = {
  espanol: 'spanish',
  deutsch: 'german',
  francais: 'french',
};

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
  const said = LANGUAGES.exec(plain(notesOf(release.title)))?.[1];
  if (said !== undefined && facts.language !== null) {
    if ((SAME_LANGUAGE[said] ?? said) !== plain(facts.language)) return true;
  }
  const kbps = kbpsBySize(release.size, facts);
  return kbps !== null && (kbps < MIN_KBPS || kbps > MAX_KBPS);
}

/** Whether the row's title says nothing but the book and its author. */
function exactly({ release }: PickRow, facts: BookFacts): boolean {
  const known = new Set([...words(facts.title), ...facts.authors.flatMap(words), ...NOTE_WORDS]);
  return words(withoutNotes(release.title)).every((word) => known.has(word) || word.length === 1);
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

/** The rows that may be the book, the likeliest first, in the order given among equals. */
export function rankRows(rows: readonly PickRow[], facts: BookFacts): PickRow[] {
  return rows
    .filter((row) => !rejected(row, facts))
    .map((row) => ({ row, scored: score(row, facts) }))
    .sort((a, b) => compare(a.scored, b.scored))
    .map(({ row }) => row);
}

export function pickRelease(rows: readonly PickRow[], facts: BookFacts): PickOutcome {
  const ranked = rankRows(rows, facts);
  const [best, ...rest] = ranked;
  if (best === undefined) return { kind: 'none' };
  if (!exactly(best, facts)) return { kind: 'choose', rows: ranked };
  return { kind: 'picked', best, others: rest.slice(0, MAX_OTHERS) };
}

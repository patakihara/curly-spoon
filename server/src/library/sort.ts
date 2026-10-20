/**
 * How a library list is put in order. By title: title, then `sub`, then the ref. By artist: `sub`
 * (a book's authors, a show's host, an album's artists), then title, then the ref, with no `sub`,
 * or an empty one, last. Names compare as the household reads them, in Finnish, so Å, Ä and Ö
 * come after Z; case is ignored and numbers read as numbers. No leading article is dropped, since
 * the index holds no sort names. Random puts the entries in ref order first, so
 * the index's own row order never shows, then shuffles them by a seed: the same seed over the same
 * entries always gives the same order.
 */
import { type LibraryEntry, type LibrarySort, mediaRefKey } from '@auralis/schema';

const names = new Intl.Collator('fi', { sensitivity: 'base', numeric: true });

const byRef = (a: LibraryEntry, b: LibraryEntry) => {
  const [x, y] = [mediaRefKey(a.ref), mediaRefKey(b.ref)];
  return x < y ? -1 : x > y ? 1 : 0;
};

/** An entry's sub, or null when it has none or only blanks. */
const subOf = (e: LibraryEntry) => (e.sub === null || e.sub.trim() === '' ? null : e.sub);

/** Two subs in order, an absent one last. */
const bySub = (a: LibraryEntry, b: LibraryEntry) => {
  const [x, y] = [subOf(a), subOf(b)];
  return x === null || y === null ? Number(x === null) - Number(y === null) : names.compare(x, y);
};

const byTitle = (a: LibraryEntry, b: LibraryEntry) => names.compare(a.title, b.title);

const ORDER: Record<
  Exclude<LibrarySort, 'random'>,
  (a: LibraryEntry, b: LibraryEntry) => number
> = {
  title: (a, b) => byTitle(a, b) || bySub(a, b) || byRef(a, b),
  artist: (a, b) => bySub(a, b) || byTitle(a, b) || byRef(a, b),
};

/** mulberry32: a small seeded generator, each draw from 0 up to 1. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Fisher–Yates shuffle of a copy of `items`, drawn from mulberry32 by `seed`. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const draw = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** The entries in a new array, in the order asked; `seed` is read only for random. */
export function sortEntries(
  entries: readonly LibraryEntry[],
  sort: LibrarySort,
  seed: number | null,
): LibraryEntry[] {
  if (sort === 'random') return shuffle([...entries].sort(byRef), seed ?? 0);
  return [...entries].sort(ORDER[sort]);
}

/**
 * How a library list is put in order: by title, by its author, host or artist (`sub`), or
 * shuffled by a seed, so the same seed over the same entries always gives the same order.
 */
import { type LibraryEntry } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle, sortEntries } from './sort.js';

const entry = (id: string, title: string, sub: string | null): LibraryEntry => ({
  ref: { source: 'abs', id },
  kind: 'book',
  title,
  sub,
  art: null,
  progress: null,
  availability: { kind: 'owned' },
});

const ids = (entries: LibraryEntry[]) => entries.map((e) => e.ref.id);

describe('[M2.sorting/a] sorting a library list', () => {
  it('[M2.sorting/a] by title ignores case and reads numbers as numbers, then breaks a tie by sub, then by ref', () => {
    const entries = [
      entry('d', 'book 10', null),
      entry('c', 'Book 2', 'Zed'),
      entry('b', 'book 2', 'Amy'),
      entry('a', 'Book 2', 'amy'),
    ];

    expect(ids(sortEntries(entries, 'title', null))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('[M2.sorting/a] by artist sorts by sub, breaks a tie by title, then by ref, and puts an entry with no sub last', () => {
    const entries = [
      entry('e', 'Alpha', null),
      entry('d', 'Beta', 'Le Guin'),
      entry('c', 'Alpha', 'le guin'),
      entry('b', 'Alpha', 'Le Guin'),
      entry('a', 'Zeta', 'Duncan'),
    ];

    expect(ids(sortEntries(entries, 'artist', null))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('[M2.sorting/a] by title breaks a tie by sub even when the refs run the other way', () => {
    const entries = [
      entry('a', 'Powers', 'Zadie Smith'),
      entry('b', 'Powers', 'Ursula K. Le Guin'),
    ];

    expect(ids(sortEntries(entries, 'title', null))).toEqual(['b', 'a']);
  });

  it('[M2.sorting/a] reads names as the household does, in Finnish: Å, Ä and Ö come after Z', () => {
    const entries = [
      entry('a', 'Öljy', 'Östen'),
      entry('b', 'Äiti', 'Ärrä'),
      entry('c', 'Åland', 'Åke'),
      entry('d', 'Zebra', 'Zorro'),
      entry('e', 'Alpha', 'Aino'),
    ];

    expect(ids(sortEntries(entries, 'title', null))).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(ids(sortEntries(entries, 'artist', null))).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('[M2.sorting/a] by artist counts an empty or blank sub as none, so it goes last', () => {
    const entries = [entry('a', 'Alpha', ''), entry('b', 'Beta', '  '), entry('c', 'Gamma', 'Zed')];

    expect(ids(sortEntries(entries, 'artist', null))).toEqual(['c', 'a', 'b']);
  });

  it('[M2.sorting/a] leaves the entries it was given as they were', () => {
    const entries = [entry('b', 'B', null), entry('a', 'A', null)];

    sortEntries(entries, 'title', null);

    expect(ids(entries)).toEqual(['b', 'a']);
  });
});

describe('[M2.sorting/a] the seeded shuffle', () => {
  it('[M2.sorting/a] draws mulberry32: the same numbers from the same seed, each from 0 up to 1', () => {
    const one = mulberry32(1);
    expect([one(), one(), one()]).toEqual([
      0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
    ]);
    const fortyTwo = mulberry32(42);
    expect([fortyTwo(), fortyTwo(), fortyTwo()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
    ]);
  });

  it('[M2.sorting/a] shuffles into the same order from the same seed, whatever order the entries came in', () => {
    const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => entry(id, id, null));
    const reversed = [...entries].reverse();

    const once = ids(sortEntries(entries, 'random', 42));

    expect(ids(sortEntries(reversed, 'random', 42))).toEqual(once);
    expect([...once].sort()).toEqual(ids(entries));
    expect(ids(sortEntries(entries, 'random', 7))).not.toEqual(once);
  });

  it('[M2.sorting/a] shuffles every item into place by Fisher–Yates, keeping every one', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];

    const shuffled = shuffle(items, 1);

    expect([...shuffled].sort()).toEqual(items);
    expect(shuffle(items, 1)).toEqual(shuffled);
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

/**
 * Recent searches are kept per person, not per device: the newest twenty, newest first, one per
 * search words (case, accents and punctuation aside), in the form last typed. They go with the
 * person.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { recentSearches, recordSearch, RECENT_KEPT } from './recentSearches.js';
import { upsertUser } from './users.js';

const T0 = Date.UTC(2026, 9, 13, 8);

let db: Db;
let kara: string;
let otto: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  kara = upsertUser(db, { username: 'kara', role: 'member' }).id;
  otto = upsertUser(db, { username: 'otto', role: 'member' }).id;
});
afterEach(() => db.close());

const queries = (userId: string, typed = '', limit = 50) =>
  recentSearches(db, userId, typed, limit).map((r) => r.query);

describe('recent searches', () => {
  it('lists a person’s own searches, newest first, and never another person’s', () => {
    recordSearch(db, kara, 'Rumours', T0);
    recordSearch(db, otto, 'Megacorp', T0 + 1);
    recordSearch(db, kara, 'Earthsea', T0 + 2);

    expect(queries(kara)).toEqual(['Earthsea', 'Rumours']);
    expect(queries(otto)).toEqual(['Megacorp']);
  });

  it('keeps one search per words, case, accents and punctuation aside, in the form last typed, moved to the top', () => {
    recordSearch(db, kara, 'Émile Zola', T0);
    recordSearch(db, kara, 'Love', T0 + 1);
    recordSearch(db, kara, 'Rumours', T0 + 2);
    recordSearch(db, kara, '  EMILE   zola ', T0 + 3);
    recordSearch(db, kara, 'love!', T0 + 4);

    expect(recentSearches(db, kara, '', 50)).toEqual([
      { query: 'love!', words: 'love', searchedAt: T0 + 4 },
      { query: 'EMILE   zola', words: 'emile zola', searchedAt: T0 + 3 },
      { query: 'Rumours', words: 'rumours', searchedAt: T0 + 2 },
    ]);
  });

  it('keeps only the newest twenty', () => {
    for (let n = 0; n < 25; n += 1) recordSearch(db, kara, `search ${n}`, T0 + n);

    expect(RECENT_KEPT).toBe(20);
    expect(queries(kara)).toEqual(Array.from({ length: 20 }, (_, n) => `search ${24 - n}`));
    expect(
      db.prepare('SELECT COUNT(*) AS n FROM recent_searches WHERE user_id = ?').get(kara),
    ).toEqual({ n: 20 });
  });

  it('finds those whose words start with the words typed, up to a limit', () => {
    recordSearch(db, kara, 'Fleetwood Mac', T0);
    recordSearch(db, kara, 'Femininomenon', T0 + 1);
    recordSearch(db, kara, 'Rumours', T0 + 2);
    recordSearch(db, kara, 'fémme', T0 + 3);

    expect(queries(kara, 'FE')).toEqual(['fémme', 'Femininomenon']);
    expect(queries(kara, 'f', 2)).toEqual(['fémme', 'Femininomenon']);
    expect(queries(kara, 'fl')).toEqual(['Fleetwood Mac']);
    expect(queries(kara, 'fleetwood-m')).toEqual(['Fleetwood Mac']);
    expect(queries(kara, '  Fleetwood,  ')).toEqual(['Fleetwood Mac']);
    expect(queries(kara, '', 2)).toEqual(['fémme', 'Rumours']);
  });

  it('keeps twenty for each person: one person searching never pushes out another’s', () => {
    for (let n = 0; n < 20; n += 1) recordSearch(db, kara, `kara ${n}`, T0 + n);
    for (let n = 0; n < 25; n += 1) recordSearch(db, otto, `otto ${n}`, T0 + 100 + n);
    recordSearch(db, kara, 'kara 20', T0 + 200);

    expect(queries(kara)).toEqual(Array.from({ length: 20 }, (_, n) => `kara ${20 - n}`));
    expect(queries(otto)).toEqual(Array.from({ length: 20 }, (_, n) => `otto ${24 - n}`));
  });

  it('counts the same words once, however often and however typed, so the other nineteen stay', () => {
    for (let n = 0; n < 20; n += 1) recordSearch(db, kara, `search ${n}`, T0 + n);
    for (let n = 0; n < 5; n += 1)
      recordSearch(db, kara, `SEARCH, ${n % 2 === 0 ? 0 : '0!'}`, T0 + 50 + n);

    expect(queries(kara)).toEqual([
      'SEARCH, 0',
      ...Array.from({ length: 19 }, (_, n) => `search ${19 - n}`),
    ]);
  });

  it('finds a search by the start of its words only, never by a later word or inside one', () => {
    recordSearch(db, kara, 'Love, Songs!', T0);
    recordSearch(db, kara, 'Glove Box', T0 + 1);

    expect(queries(kara, 'LOVE-so')).toEqual(['Love, Songs!']);
    expect(queries(kara, 'love songs')).toEqual(['Love, Songs!']);
    expect(queries(kara, 'songs')).toEqual([]);
    expect(queries(kara, 'loves')).toEqual([]);
    expect(queries(kara, 'love  box')).toEqual([]);
  });

  it('records nothing for a search with no words in it', () => {
    for (const typed of ['   ', '"', '*', '..', '\u0000', '\uD800', "' ’"])
      recordSearch(db, kara, typed, T0);

    expect(queries(kara)).toEqual([]);
  });

  it('go with the person', () => {
    recordSearch(db, kara, 'Rumours', T0);
    db.prepare('DELETE FROM users WHERE id = ?').run(kara);

    expect(db.prepare('SELECT COUNT(*) AS n FROM recent_searches').get()).toEqual({ n: 0 });
  });
});

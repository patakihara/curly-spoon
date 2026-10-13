/**
 * Suggestions as you type: your own recent searches first, then the household's index, on an
 * index holding the four recorded Ursula K. Le Guin books, written as the index job writes them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Suggestion } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { absTree } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { recordSearch } from '../store/recentSearches.js';
import { upsertUser } from '../store/users.js';
import { suggest } from './suggest.js';

const RECORDINGS = fileURLToPath(
  new URL('../adapters/audiobookshelf/recordings/', import.meta.url),
);
const T0 = Date.UTC(2026, 9, 13, 8);

let db: Db;
let kara: string;
let otto: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  for (const call of ['shell-book-1', 'shell-book-2', 'series-book-1', 'series-book-2']) {
    const r = recordingSchema.parse(
      JSON.parse(readFileSync(join(RECORDINGS, `${call}.json`), 'utf8')),
    );
    const item = itemSummarySchema.parse((r.response.body as { json: unknown }).json);
    applyTree(db, absTree(item), T0, emptyCounts());
  }
  kara = upsertUser(db, { username: 'kara', role: 'member' }).id;
  otto = upsertUser(db, { username: 'otto', role: 'member' }).id;
});
afterEach(() => db.close());

const shown = (suggestions: Suggestion[]) => suggestions.map((s) => [s.kind, s.text]);

describe('suggestions', () => {
  it('with less than two letters typed, offer only your recent searches: the newest eight, else those starting with it', () => {
    const typed = ['Powers', 'Earthsea', 'pottery', 'Émile', 'rumours', 'a', 'b', 'c', 'd', 'e'];
    typed.forEach((q, n) => recordSearch(db, kara, q, T0 + n));

    expect(shown(suggest(db, kara, ''))).toEqual(
      ['e', 'd', 'c', 'b', 'a', 'rumours', 'Émile', 'pottery'].map((q) => ['recent', q]),
    );
    expect(shown(suggest(db, kara, 'P'))).toEqual([
      ['recent', 'pottery'],
      ['recent', 'Powers'],
    ]);
    expect(shown(suggest(db, kara, ' É '))).toEqual([
      ['recent', 'e'],
      ['recent', 'Émile'],
      ['recent', 'Earthsea'],
    ]);
    expect(suggest(db, kara, '').every((s) => s.ref === null)).toBe(true);
  });

  it('offer up to three of your matching recent searches first, then the index, eight in all', () => {
    for (const [n, q] of ['lemons', 'le guin', 'Le Guin novels', 'legends', 'rumours'].entries()) {
      recordSearch(db, kara, q, T0 + n);
    }

    const suggested = suggest(db, kara, 'Le');
    expect(shown(suggested.slice(0, 4))).toEqual([
      ['recent', 'legends'],
      ['recent', 'Le Guin novels'],
      ['recent', 'le guin'],
      ['author', 'Ursula K. Le Guin'],
    ]);
    expect(suggested.slice(4).map((s) => s.kind)).toEqual(['book', 'book', 'book', 'book']);
    expect(suggested[3]!.ref).toEqual(expect.objectContaining({ source: 'abs' }));
  });

  it('never offer another person’s recent searches', () => {
    recordSearch(db, otto, 'Powers of ten', T0);
    recordSearch(db, otto, 'powder', T0 + 1);

    expect(shown(suggest(db, kara, ''))).toEqual([]);
    expect(shown(suggest(db, kara, 'pow'))).toEqual([['book', 'Powers [Sandvold]']]);
    expect(shown(suggest(db, otto, 'pow'))).toEqual([
      ['recent', 'powder'],
      ['recent', 'Powers of ten'],
      ['book', 'Powers [Sandvold]'],
    ]);
  });
});

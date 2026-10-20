import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { bookRef, index, one, show1, show2, three, two } from '../adapters/http/listsServer.js';
import { absTree } from '../libraryIndex/rows.js';
import {
  applyTree,
  emptyCounts,
  episodesInOrder,
  indexedRow,
  type StoredRow,
} from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { episodeAfter, laterInSeries } from './next.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const seriesBooks = (['series-book-1', 'series-book-2'] as const).map((call) => {
  const file = join(ADAPTERS, 'audiobookshelf', 'recordings', `${call}.json`);
  const r = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  return itemSummarySchema.parse((r.response.body as { json: unknown }).json);
});

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  index(db);
  const counts = emptyCounts();
  for (const book of seriesBooks) applyTree(db, absTree(book), 1, counts);
});
afterEach(() => db.close());

const row = (id: string): StoredRow => indexedRow(db, 'abs', id)!;
const ids = (rows: (StoredRow | null)[]) => rows.map((r) => r?.id ?? null);
const none = () => false;

describe('[M2.sorting] the episode after one in its show', () => {
  it('follows a serial show oldest to newest', async () => {
    const after = await Promise.all(
      [one, two, three].map((e) => episodeAfter(db, row(e.id), none)),
    );
    const [first, second, third, fourth] = episodesInOrder(db, show1.id);
    expect(first!.id).toBe(one.id);
    expect(ids(after)).toEqual([second!.id, third!.id, fourth!.id]);
    expect(ids(after).slice(0, 2)).toEqual([two.id, three.id]);
  });

  it('follows an episodic show newest to oldest', async () => {
    const order = episodesInOrder(db, show2.id);
    expect(order.length).toBeGreaterThan(2);
    const next = await episodeAfter(db, order[0]!, none);
    expect(next?.id).toBe(order[1]!.id);
  });

  it('skips the episodes that count as done, and only those', async () => {
    const skipped: string[] = [];
    const next = await episodeAfter(db, row(one.id), (e) => {
      skipped.push(e.id);
      return e.id === two.id;
    });
    expect(next?.id).toBe(three.id);
    expect(skipped).toEqual([two.id, three.id]);
  });

  it('has nothing after the end of a show, never going back to an earlier one', async () => {
    const order = episodesInOrder(db, show1.id);
    expect(await episodeAfter(db, order.at(-1)!, none)).toBeNull();
    expect(await episodeAfter(db, row(three.id), () => true)).toBeNull();
  });

  it('has nothing after a row with no show', async () => {
    expect(await episodeAfter(db, row(show1.id), none)).toBeNull();
  });
});

describe('[M2.sorting] the next book in a series', () => {
  const [first, second] = seriesBooks.map((b) => b.id) as [string, string];

  it('is the first later book in the series that is not finished', async () => {
    expect((await laterInSeries(db, row(first), none))?.id).toBe(second);
  });

  it('skips a finished later book, and is nothing after the last', async () => {
    expect(await laterInSeries(db, row(first), (b) => b.id === second)).toBeNull();
    expect(await laterInSeries(db, row(second), none)).toBeNull();
  });

  it('asks nothing about a book that is in no series', async () => {
    const asked: string[] = [];
    const lone = row(bookRef.id);
    expect(lone.series).toEqual([]);
    expect(
      await laterInSeries(db, lone, (b) => {
        asked.push(b.id);
        return false;
      }),
    ).toBeNull();
    expect(asked).toEqual([]);
  });
});

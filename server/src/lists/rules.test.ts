/**
 * The digest rule's edges, on an index of the two recorded shows, dated by their recorded feeds,
 * some dates moved so that episodes of two shows, and two of one show, come out at one moment.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema, type ShowSummary } from '../adapters/audiobookshelf/schemas.js';
import { parseFeed } from '../adapters/feed/client.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { absTree, orderingFromFeed, type ShowOrdering } from '../libraryIndex/rows.js';
import {
  applyTree,
  emptyCounts,
  episodesInOrder,
  indexedRow,
  type StoredRow,
} from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import type { AbsAccess } from '../routes/library.js';
import { digestEpisodes, isPlayed, showFinished } from './rules.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..', 'adapters');
const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const show = (call: string) =>
  itemSummarySchema.parse(
    (recording('audiobookshelf', call).response.body as { json: unknown }).json,
  ) as ShowSummary;
const feed = (call: string) =>
  parseFeed((recording('feed', call).response.body as { text: string }).text);

const show1 = show('index-show-1');
const show2 = show('index-show-2');
const episode = (s: ShowSummary, title: string) =>
  s.media.episodes.find((e) => e.title.includes(title))!.id;
const [one, two, three, four] = [', Part One:', ', Part Two:', ', Part Three:', ', Part Four:'].map(
  (t) => episode(show1, t),
) as [string, string, string, string];
const megacorp02 = episode(show2, '02: ');

const DAY = 24 * 60 * 60 * 1000;
/** When show 1's Part Two came out, by its feed. */
const ordering1 = orderingFromFeed(show1, feed('show-1-feed'));
const T = ordering1.publishedAt.get(two)!;

/** An ordering with the episodes named moved to `at`. */
const movedTo = (ordering: ShowOrdering, at: number, ids: string[]): ShowOrdering => ({
  ...ordering,
  publishedAt: new Map([...ordering.publishedAt, ...ids.map((id) => [id, at] as const)]),
});

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

const all: AbsAccess = {
  open: () => true,
  standing: () => ({ progress: null, finished: false, updatedAt: null }),
};
const row = (id: string) => indexedRow(db, 'abs', id)!;
const ids = (rows: StoredRow[]) => rows.map((r) => r.id);

describe('played', () => {
  it('counts a mark made at the moment Audiobookshelf last changed the episode, as well as a later one', () => {
    const unfinished = { progress: 0.3, finished: false, updatedAt: 1000 };

    expect(isPlayed(unfinished, 999)).toBe(false);
    expect(isPlayed(unfinished, 1000)).toBe(true);
    expect(isPlayed(unfinished, 1001)).toBe(true);
    expect(isPlayed({ ...unfinished, updatedAt: null }, 1)).toBe(true);
    expect(isPlayed(unfinished, undefined)).toBe(false);
    expect(isPlayed({ ...unfinished, finished: true }, undefined)).toBe(true);
  });
});

describe('a show on a listening list', () => {
  it('is never finished while the index holds none of its episodes', () => {
    const bare = structuredClone(show1);
    bare.media.episodes = [];
    applyTree(db, absTree(bare, ordering1), 1, emptyCounts());
    const finishedAll: AbsAccess = {
      ...all,
      standing: () => ({ progress: 1, finished: true, updatedAt: 1 }),
    };

    expect(episodesInOrder(db, show1.id)).toEqual([]);
    expect(showFinished(db, row(show1.id), finishedAll)).toBe(false);
  });
});

describe('a digest’s order', () => {
  it('runs episodes of one moment by show id, then the show’s own order, in either direction', () => {
    const counts = emptyCounts();
    applyTree(db, absTree(show1, movedTo(ordering1, T, [three])), 1, counts);
    const ordering2 = orderingFromFeed(show2, feed('show-2-feed'));
    applyTree(db, absTree(show2, movedTo(ordering2, T, [megacorp02])), 1, counts);
    const shows = [row(show1.id), row(show2.id)];
    const sameMoment = episodesInOrder(db, show1.id)
      .filter((e) => e.publishedAt === T)
      .map((e) => e.id);
    const [first, second] = [show1.id, show2.id].sort();
    const tied = [
      ...(first === show2.id ? [megacorp02] : sameMoment),
      ...(second === show2.id ? [megacorp02] : sameMoment),
    ];
    const now = T + 3 * DAY;

    const oldest = digestEpisodes(db, shows, 'oldest', now, () => false);
    const newest = digestEpisodes(db, shows, 'newest', now, () => false);

    expect(sameMoment.sort()).toEqual([two, three].sort());
    expect(ids(oldest)).toEqual([one, ...tied, four]);
    expect(ids(newest)).toEqual([four, ...tied, one]);
  });
});

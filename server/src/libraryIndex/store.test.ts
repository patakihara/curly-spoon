import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { openDatabase, type Db } from '../store/connection.js';
import { absTree } from './rows.js';
import {
  applyTree,
  emptyCounts,
  episodesInOrder,
  listIndexed,
  removeItem,
  unseenItems,
} from './store.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));

function recordedShow(call: string) {
  const file = join(ADAPTERS, 'audiobookshelf', 'recordings', `${call}.json`);
  const { response } = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (response.body === null || !('json' in response.body)) throw new Error(call);
  return itemSummarySchema.parse(response.body.json);
}

/** `target`, counting the statements prepared through it. */
function counting(target: Db) {
  let prepared = 0;
  const db = new Proxy(target, {
    get(t, key) {
      if (key === 'prepare') {
        return (sql: string) => {
          prepared += 1;
          return t.prepare(sql);
        };
      }
      const value: unknown = Reflect.get(t, key, t);
      return typeof value === 'function' ? (value as () => unknown).bind(t) : value;
    },
  });
  return { db, prepared: () => prepared };
}

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

describe('the index store', () => {
  it('writes a thousand rows with the statements it prepared for the first few', () => {
    const show = absTree(recordedShow('index-show-1'));
    const episode = show.children[0]!;
    const episodes = (ids: number[], title = (id: number) => `Episode ${id}`) =>
      ids.map((id) => ({ ...episode, id: `episode-${id}`, title: title(id) }));
    const counted = counting(db);
    // New rows, then a changed one, a new one and a removed one: every way a row is written.
    applyTree(counted.db, { top: show.top, children: episodes([0, 1]) }, 1, emptyCounts());
    applyTree(
      counted.db,
      { top: show.top, children: episodes([1, 2], (id) => `Renamed ${id}`) },
      2,
      emptyCounts(),
    );
    const prepared = counted.prepared();
    const counts = emptyCounts();

    const thousand = Array.from({ length: 1000 }, (_, n) => n + 1);
    applyTree(counted.db, { top: show.top, children: episodes(thousand) }, 3, counts);

    expect([counts.inserted, counts.updated]).toEqual([998, 2]);
    expect(counted.prepared()).toBe(prepared);
  });

  it('names the shows a pass did not see, only in the library it paged', () => {
    const [kept, unseen] = [recordedShow('index-show-1'), recordedShow('index-show-2')];
    const counts = emptyCounts();
    for (const show of [kept, unseen]) applyTree(db, absTree(show), 1, counts);

    expect(unseenItems(db, 'abs', kept.libraryId, new Set([kept.id]))).toEqual([unseen.id]);
    expect(unseenItems(db, 'abs', 'another-library', new Set())).toEqual([]);
  });

  it('removes a show with its episodes and external ids, and nothing else', () => {
    const [kept, gone] = [recordedShow('index-show-1'), recordedShow('index-show-2')];
    const counts = emptyCounts();
    for (const show of [kept, gone]) applyTree(db, absTree(show), 1, counts);

    removeItem(db, 'abs', gone.id, counts);

    const left = listIndexed(db);
    expect(left.every((row) => row.id === kept.id || row.parentId === kept.id)).toBe(true);
    expect(left).toHaveLength(1 + absTree(kept).children.length);
    expect(counts.removed).toBe(1 + absTree(gone).children.length);
    const ids = db
      .prepare('SELECT COUNT(*) AS n FROM index_ids WHERE upstream_id = ?')
      .get(gone.id);
    expect(ids).toEqual({ n: 0 });
  });

  it('orders episodes of one date in the show’s own direction, unnumbered ones last', () => {
    const show = recordedShow('index-show-2');
    if (show.mediaType !== 'podcast') throw new Error('expected a show');
    const numbers: [string | null, string | null][] = [
      [null, null],
      ['1', '2'],
      ['2', '1'],
      ['1', '1'],
    ];
    show.media.episodes = show.media.episodes.slice(0, numbers.length).map((e, n) => ({
      ...e,
      season: numbers[n]![0],
      episode: numbers[n]![1],
    }));
    const sameDay = new Map(show.media.episodes.map((e) => [e.id, Date.UTC(2024, 0, 1)]));
    const seasonEpisode = () =>
      episodesInOrder(db, show.id).map((e) => (e.disc === null ? '-' : `${e.disc}.${e.position}`));

    applyTree(db, absTree(show, { order: 'serial', publishedAt: sameDay }), 1, emptyCounts());
    expect(seasonEpisode()).toEqual(['1.1', '1.2', '2.1', '-']);

    applyTree(db, absTree(show, { order: 'episodic', publishedAt: sameDay }), 2, emptyCounts());
    expect(seasonEpisode()).toEqual(['2.1', '1.2', '1.1', '-']);
  });

  it('orders a numbered episode with no season within the show’s one season', () => {
    const show = recordedShow('index-show-2');
    if (show.mediaType !== 'podcast') throw new Error('expected a show');
    const numbers: [string | null, string][] = [
      ['1', '3'],
      [null, '2'],
      ['1', '1'],
    ];
    show.media.episodes = show.media.episodes.slice(0, numbers.length).map((e, n) => ({
      ...e,
      season: numbers[n]![0],
      episode: numbers[n]![1],
    }));
    const sameDay = new Map(show.media.episodes.map((e) => [e.id, Date.UTC(2024, 0, 1)]));
    const numbered = () => episodesInOrder(db, show.id).map((e) => e.position);

    applyTree(db, absTree(show, { order: 'serial', publishedAt: sameDay }), 1, emptyCounts());
    expect(numbered()).toEqual([1, 2, 3]);

    applyTree(db, absTree(show, { order: 'episodic', publishedAt: sameDay }), 2, emptyCounts());
    expect(numbered()).toEqual([3, 2, 1]);
  });
});

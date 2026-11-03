import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MediaRef } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import { index, two } from '../adapters/http/listsServer.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { absTree } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import type { SessionPlay, SessionValue } from '../store/listening.js';
import { IndexLookup } from './lookup.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const series = (['series-book-1', 'series-book-2'] as const).map((call) => {
  const file = join(ADAPTERS, 'audiobookshelf', 'recordings', `${call}.json`);
  const r = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  return itemSummarySchema.parse((r.response.body as { json: unknown }).json);
});
const [book1, book2] = series.map((b): MediaRef => ({ source: 'abs', id: b.id })) as [
  MediaRef,
  MediaRef,
];

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  index(db);
  const counts = emptyCounts();
  for (const b of series) applyTree(db, absTree(b), 1, counts);
});
afterEach(() => db.close());

/** An idle session whose spoken history is `history`, oldest first. */
function idle(history: SessionPlay[]): SessionValue {
  const queue = { current: null, position: null, user: [], context: null };
  return {
    active: 'spoken',
    switchAfterCurrent: null,
    queueStyle: 'youtube',
    queues: { music: queue, spoken: queue },
    history,
    autoplay: { music: null, spoken: null },
    radio: null,
    autoplayAt: null,
    spokenDigest: null,
    saved: [],
  };
}

describe("[M2.lists/d] the books autoplay reads chapters of, past a digest's plays", () => {
  it('[M2.lists/d] follows your own newest play, not an episode a digest played after it', () => {
    const lookup = new IndexLookup(db, { warn: () => {} });
    const session = idle([
      { seq: 0, queue: 'spoken', ref: book1, chapter: 9, playedAt: 1000 },
      { seq: 1, queue: 'spoken', ref: two, playedAt: 2000, list: 'a-digest' },
    ]);

    expect(lookup.autoplayBooks(session)).toEqual([book1, book1, book2]);
  });
});

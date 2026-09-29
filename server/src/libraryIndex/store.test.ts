import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import { recordingSchema } from '../adapters/http/recording.js';
import { openDatabase, type Db } from '../store/connection.js';
import { absTree } from './rows.js';
import { applyTree, emptyCounts, listIndexed, removeUnseen } from './store.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));

function recordedShow(call: string) {
  const file = join(ADAPTERS, 'audiobookshelf', 'recordings', `${call}.json`);
  const { response } = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (response.body === null || !('json' in response.body)) throw new Error(call);
  return itemSummarySchema.parse(response.body.json);
}

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

describe('the index store', () => {
  it('after a complete pass, removes the shows it did not see, with their episodes', () => {
    const [kept, gone] = [recordedShow('index-show-1'), recordedShow('index-show-2')];
    const counts = emptyCounts();
    for (const show of [kept, gone]) applyTree(db, absTree(show), 1, counts);

    removeUnseen(db, 'abs', kept.libraryId, new Set([kept.id]), counts);

    const left = listIndexed(db);
    expect(left.every((row) => row.id === kept.id || row.parentId === kept.id)).toBe(true);
    expect(left).toHaveLength(1 + absTree(kept).children.length);
    expect(counts.removed).toBe(1 + absTree(gone).children.length);
    const ids = db
      .prepare('SELECT COUNT(*) AS n FROM index_ids WHERE upstream_id = ?')
      .get(gone.id);
    expect(ids).toEqual({ n: 0 });
  });

  it('never removes items of another library', () => {
    const show = recordedShow('index-show-1');
    const counts = emptyCounts();
    applyTree(db, absTree(show), 1, counts);
    removeUnseen(db, 'abs', 'another-library', new Set(), counts);
    expect(counts.removed).toBe(0);
    expect(listIndexed(db)).toHaveLength(1 + absTree(show).children.length);
  });
});

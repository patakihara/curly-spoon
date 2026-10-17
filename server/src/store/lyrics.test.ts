import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type IndexRow } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, indexedRow, removeItem } from '../libraryIndex/store.js';
import type { LyricsAnswer } from '../lyrics/choose.js';
import { openDatabase, type Db } from './connection.js';
import { cachedLyrics, isFresh, LYRICS_RECHECK_MS, staleTrackIds, writeLyrics } from './lyrics.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 17);

const row = (id: string, kind: 'album' | 'track', parentId: string | null): IndexRow => ({
  source: 'jellyfin',
  id,
  kind,
  parentId,
  libraryId: 'music',
  title: id,
  creators: [],
  series: [],
  genres: [],
  position: null,
  disc: null,
  duration: 200,
  year: null,
  publishedAt: null,
  upstreamVersion: null,
  ids: {},
  episodeOrder: null,
  hasArt: false,
  hasLyrics: false,
});

const synced: LyricsAnswer = {
  status: 'synced',
  source: 'lrclib',
  lines: [{ start: 1.5, text: 'sung' }],
};
const none: LyricsAnswer = { status: 'none', source: null, lines: [] };
const plain: LyricsAnswer = {
  status: 'plain',
  source: 'jellyfin',
  lines: [{ start: null, text: 'said' }],
};
const instrumental: LyricsAnswer = { status: 'instrumental', source: 'lrclib', lines: [] };

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  applyTree(
    db,
    {
      top: row('album', 'album', null),
      children: ['a', 'b', 'c'].map((t) => row(t, 'track', 'album')),
    },
    T0,
    emptyCounts(),
  );
});
afterEach(() => db.close());

const track = (id: string) => indexedRow(db, 'jellyfin', id)!;
const at = (now: number) => ({ now, recheckMs: LYRICS_RECHECK_MS });

describe('the lyrics cache', () => {
  it('keeps an answer with its lines, source, LRCLIB record and the version it was resolved for', () => {
    writeLyrics(db, track('a'), synced, 42, T0);
    expect(cachedLyrics(db, 'jellyfin', 'a')).toEqual({
      ...synced,
      lrclibId: 42,
      itemVersion: 1,
      resolvedAt: T0,
    });
    expect(cachedLyrics(db, 'jellyfin', 'b')).toBeUndefined();
  });

  it('replaces an older answer for the same track', () => {
    writeLyrics(db, track('a'), none, null, T0);
    writeLyrics(db, track('a'), synced, 42, T0 + DAY);
    expect(cachedLyrics(db, 'jellyfin', 'a')?.status).toBe('synced');
  });

  it('keeps synced and instrumental answers fresh while the track keeps its version', () => {
    for (const answer of [synced, instrumental]) {
      writeLyrics(db, track('a'), answer, 1, T0);
      const cached = cachedLyrics(db, 'jellyfin', 'a')!;
      expect(isFresh(cached, 1, at(T0 + 365 * DAY))).toBe(true);
      expect(isFresh(cached, 2, at(T0))).toBe(false);
    }
  });

  it('keeps plain answers and none fresh for 30 days, then not', () => {
    for (const answer of [plain, none]) {
      writeLyrics(db, track('a'), answer, null, T0);
      const cached = cachedLyrics(db, 'jellyfin', 'a')!;
      expect(isFresh(cached, 1, at(T0 + 30 * DAY - 1))).toBe(true);
      expect(isFresh(cached, 1, at(T0 + 30 * DAY))).toBe(false);
      expect(isFresh(cached, 2, at(T0))).toBe(false);
    }
  });

  it('names the Jellyfin tracks with no fresh answer: none cached, an old version, or an expired none', () => {
    writeLyrics(db, track('a'), synced, 1, T0);
    writeLyrics(db, track('b'), none, null, T0);
    expect(staleTrackIds(db, 10, at(T0 + DAY)).sort()).toEqual(['c']);
    expect(staleTrackIds(db, 10, at(T0 + 30 * DAY)).sort()).toEqual(['b', 'c']);
    applyTree(
      db,
      {
        top: row('album', 'album', null),
        children: [
          { ...row('a', 'track', 'album'), title: 'renamed' },
          row('b', 'track', 'album'),
          row('c', 'track', 'album'),
        ],
      },
      T0 + DAY,
      emptyCounts(),
    );
    expect(staleTrackIds(db, 10, at(T0 + DAY)).sort()).toEqual(['a', 'c']);
    expect(staleTrackIds(db, 1, at(T0 + DAY))).toHaveLength(1);
  });

  it('goes with its track when the track leaves the index', () => {
    writeLyrics(db, track('a'), synced, 1, T0);
    removeItem(db, 'jellyfin', 'album', emptyCounts());
    expect(db.prepare('SELECT COUNT(*) AS n FROM lyrics').get()).toEqual({ n: 0 });
  });

  it('writes nothing for a track the index no longer holds', () => {
    const gone = track('a');
    removeItem(db, 'jellyfin', 'album', emptyCounts());
    writeLyrics(db, gone, synced, 1, T0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM lyrics').get()).toEqual({ n: 0 });
  });

  it('refuses to read lines that are not lyric lines', () => {
    writeLyrics(db, track('a'), synced, 1, T0);
    db.prepare(`UPDATE lyrics SET lines = '[{"start":-1,"text":"x"}]'`).run();
    expect(() => cachedLyrics(db, 'jellyfin', 'a')).toThrow();
  });

  it('refuses a source on none, and no source on lyrics', () => {
    expect(() => writeLyrics(db, track('a'), { ...none, source: 'lrclib' }, null, T0)).toThrow();
    expect(() => writeLyrics(db, track('a'), { ...synced, source: null }, null, T0)).toThrow();
  });
});

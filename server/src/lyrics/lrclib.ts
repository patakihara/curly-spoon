/**
 * LRCLIB's record as lyric lines: instrumental when it says so, else synced when its
 * `syncedLyrics` holds a timed line with words (breaks alone hold none), else plain when its
 * `plainLyrics` holds text, else none. No record (LRCLIB's 404) is none.
 */
import { type LrclibRecord } from '../adapters/lrclib/schemas.js';
import { type Found, NOTHING_FOUND } from './choose.js';
import { parseLrc, plainLines } from './lrc.js';

export function fromLrclib(record: LrclibRecord | null): Found {
  if (record === null) return NOTHING_FOUND;
  if (record.instrumental) return { status: 'instrumental', lines: [] };
  const synced = parseLrc(record.syncedLyrics ?? '');
  if (synced.some((l) => l.text !== '')) return { status: 'synced', lines: synced };
  const plain = plainLines(record.plainLyrics ?? '');
  if (plain.some((l) => l.text.trim() !== '')) return { status: 'plain', lines: plain };
  return NOTHING_FOUND;
}

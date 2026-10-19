import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recordingSchema } from '../adapters/http/recording.js';
import { lrclibRecordSchema } from '../adapters/lrclib/schemas.js';
import { fromLrclib } from './lrclib.js';

function recordedLrclib(call: string) {
  const file = fileURLToPath(
    new URL(`../adapters/lrclib/recordings/${call}.json`, import.meta.url),
  );
  const body = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).response.body;
  if (body === null || !('json' in body)) throw new Error(call);
  return lrclibRecordSchema.parse(body.json);
}

describe("reading LRCLIB's record", () => {
  it('takes a recorded record with synced lyrics as synced', () => {
    const found = fromLrclib(recordedLrclib('lrclib-get-synced'));
    expect(found.status).toBe('synced');
    expect(found.lines[0]).toEqual({ start: 32.19, text: 'Like the legend of the phoenix, huh' });
  });

  it('takes a recorded instrumental record as instrumental, with no lines', () => {
    expect(fromLrclib(recordedLrclib('lrclib-get-instrumental'))).toEqual({
      status: 'instrumental',
      lines: [],
    });
  });

  it('takes no record as none', () => {
    expect(fromLrclib(null)).toEqual({ status: 'none', lines: [] });
  });

  it('takes an empty syncedLyrics as no synced lyrics, falling back to plain, then none', () => {
    const record = { ...recordedLrclib('lrclib-get-synced'), syncedLyrics: '' };
    expect(fromLrclib(record).status).toBe('plain');
    expect(fromLrclib({ ...record, plainLyrics: '' })).toEqual({ status: 'none', lines: [] });
    expect(fromLrclib({ ...record, plainLyrics: null, syncedLyrics: null }).status).toBe('none');
  });

  it('takes synced lyrics of breaks only as no synced lyrics, falling back to plain, then none', () => {
    const record = {
      ...recordedLrclib('lrclib-get-synced'),
      syncedLyrics: '[00:01.00]\n[00:05.00] \n[00:09.00]',
    };
    expect(fromLrclib(record).status).toBe('plain');
    expect(fromLrclib({ ...record, plainLyrics: null })).toEqual({ status: 'none', lines: [] });
  });
});

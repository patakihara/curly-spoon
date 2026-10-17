import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recordingSchema } from '../adapters/http/recording.js';
import { jellyfinLyricsSchema } from '../adapters/jellyfin/schemas.js';
import { fromJellyfin } from './jellyfin.js';

function recordedJellyfin(call: string) {
  const file = fileURLToPath(
    new URL(`../adapters/jellyfin/recordings/${call}.json`, import.meta.url),
  );
  const body = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).response.body;
  if (body === null || !('json' in body)) throw new Error(call);
  return jellyfinLyricsSchema.parse(body.json);
}

describe("reading Jellyfin's lyrics", () => {
  it('gives a recorded synced file its lines, each Start in ticks as seconds', () => {
    expect(fromJellyfin(recordedJellyfin('jf-lyrics-synced'))).toEqual({
      status: 'synced',
      lines: [
        { start: 5.89, text: "I know there's nothing to say" },
        { start: 10.07, text: 'Someone has taken my place' },
        { start: 13.39, text: 'When times go bad, when times go rough' },
        { start: 17.34, text: "Won't you lay me down in the tall grass" },
      ],
    });
  });

  it('gives a recorded plain file its lines, untimed', () => {
    expect(fromJellyfin(recordedJellyfin('jf-lyrics-plain'))).toEqual({
      status: 'plain',
      lines: [
        { start: null, text: 'Telling me to go' },
        { start: null, text: 'But hands beg me to stay' },
        { start: null, text: 'Your lips say that you love' },
        { start: null, text: 'Your eyes say that you hate' },
      ],
    });
  });

  it('keeps an empty timed line as a break, and rounds a Start to the millisecond', () => {
    const answer = {
      Lyrics: [
        { Text: 'sung', Start: 24_700_000 },
        { Text: '', Start: 100_004_999 },
        { Text: 'again', Start: 120_000_000 },
      ],
    };
    expect(fromJellyfin(answer).lines).toEqual([
      { start: 2.47, text: 'sung' },
      { start: 10, text: '' },
      { start: 12, text: 'again' },
    ]);
  });

  it('reads a file with some lines untimed as plain, without its empty lines at the end', () => {
    const answer = { Lyrics: [{ Text: 'a', Start: 1 }, { Text: '' }, { Text: 'b' }, { Text: '' }] };
    expect(fromJellyfin(answer)).toEqual({
      status: 'plain',
      lines: [
        { start: null, text: 'a' },
        { start: null, text: '' },
        { start: null, text: 'b' },
      ],
    });
  });

  it('finds none in no answer, no lines, or only empty lines', () => {
    for (const answer of [null, { Lyrics: [] }, { Lyrics: [{ Text: ' ', Start: 1 }] }]) {
      expect(fromJellyfin(answer)).toEqual({ status: 'none', lines: [] });
    }
  });
});

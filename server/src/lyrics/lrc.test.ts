import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recordingSchema } from '../adapters/http/recording.js';
import { lrclibRecordSchema } from '../adapters/lrclib/schemas.js';
import { parseLrc, plainLines } from './lrc.js';

function recordedLrclib(call: string) {
  const file = fileURLToPath(
    new URL(`../adapters/lrclib/recordings/${call}.json`, import.meta.url),
  );
  const body = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).response.body;
  if (body === null || !('json' in body)) throw new Error(call);
  return lrclibRecordSchema.parse(body.json);
}

describe('reading LRC', () => {
  it("gives LRCLIB's recorded synced lyrics as lines timed in seconds, in order", () => {
    const { syncedLyrics } = recordedLrclib('lrclib-get-synced');
    expect(parseLrc(syncedLyrics!)).toEqual([
      { start: 32.19, text: 'Like the legend of the phoenix, huh' },
      { start: 36.22, text: 'Our ends were beginnings' },
      { start: 40.43, text: 'What keeps the planet spinning? Ah' },
      { start: 44.68, text: 'The force from the beginning' },
    ]);
  });

  it('sings a line with several time tags at each of them, by start', () => {
    expect(parseLrc('[00:10.00][00:30.00] chorus\n[00:20.00] verse')).toEqual([
      { start: 10, text: 'chorus' },
      { start: 20, text: 'verse' },
      { start: 30, text: 'chorus' },
    ]);
  });

  it('keeps lines that start together in the order written', () => {
    expect(parseLrc('[00:05.00] one\n[00:05.00] two')).toEqual([
      { start: 5, text: 'one' },
      { start: 5, text: 'two' },
    ]);
  });

  it('reads a fraction of one, two or three digits as tenths, hundredths or thousandths', () => {
    expect(parseLrc('[00:01.5] a\n[00:01.05] b\n[00:01.005] c\n[00:02] d')).toEqual([
      { start: 1.005, text: 'c' },
      { start: 1.05, text: 'b' },
      { start: 1.5, text: 'a' },
      { start: 2, text: 'd' },
    ]);
  });

  it('takes minutes past 59', () => {
    expect(parseLrc('[75:01.00] late')).toEqual([{ start: 4501, text: 'late' }]);
  });

  it('splits on CRLF as on LF', () => {
    expect(parseLrc('[00:01.00] a\r\n[00:02.00] b\r\n')).toEqual([
      { start: 1, text: 'a' },
      { start: 2, text: 'b' },
    ]);
  });

  it('drops metadata and untimed lines, and keeps an empty timed line as a break', () => {
    const lrc =
      '[ar:Someone]\n[length:03:20]\n[00:01.00] sung\n[00:05.00]\nstray text\n[00:09.00] again';
    expect(parseLrc(lrc)).toEqual([
      { start: 1, text: 'sung' },
      { start: 5, text: '' },
      { start: 9, text: 'again' },
    ]);
  });

  it('makes every line earlier by a positive offset in milliseconds, never before 0', () => {
    expect(parseLrc('[offset:+1500]\n[00:01.00] a\n[00:03.00] b')).toEqual([
      { start: 0, text: 'a' },
      { start: 1.5, text: 'b' },
    ]);
    expect(parseLrc('[offset:-250]\n[00:01.00] a')).toEqual([{ start: 1.25, text: 'a' }]);
  });

  it('finds no lines in empty text or text with no time tag', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('just words\nmore words')).toEqual([]);
  });
});

describe('reading plain lyrics', () => {
  it("gives LRCLIB's recorded plain lyrics as untimed lines", () => {
    const { plainLyrics } = recordedLrclib('lrclib-get-synced');
    expect(plainLines(plainLyrics!)).toEqual([
      { start: null, text: 'Like the legend of the phoenix, huh' },
      { start: null, text: 'Our ends were beginnings' },
      { start: null, text: 'What keeps the planet spinning? Ah' },
      { start: null, text: 'The force from the beginning' },
    ]);
  });

  it('keeps empty lines between verses and drops the ones at the end', () => {
    expect(plainLines('one\r\n\r\ntwo\n\n  \n')).toEqual([
      { start: null, text: 'one' },
      { start: null, text: '' },
      { start: null, text: 'two' },
    ]);
  });
});

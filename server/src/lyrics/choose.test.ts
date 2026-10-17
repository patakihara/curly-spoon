import { describe, expect, it } from 'vitest';
import { chooseLyrics, type Found } from './choose.js';

const synced = (text: string): Found => ({ status: 'synced', lines: [{ start: 1, text }] });
const plain = (text: string): Found => ({ status: 'plain', lines: [{ start: null, text }] });
const instrumental: Found = { status: 'instrumental', lines: [] };
const none: Found = { status: 'none', lines: [] };

describe('choosing a track’s lyrics', () => {
  it("takes Jellyfin's synced lines over anything LRCLIB has", () => {
    for (const lrclib of [synced('lrclib'), instrumental, plain('lrclib'), none, null]) {
      expect(chooseLyrics(synced('jf'), lrclib)).toEqual({ ...synced('jf'), source: 'jellyfin' });
    }
  });

  it("takes LRCLIB's synced lines over Jellyfin's plain ones", () => {
    expect(chooseLyrics(plain('jf'), synced('lrclib'))).toEqual({
      ...synced('lrclib'),
      source: 'lrclib',
    });
  });

  it("takes LRCLIB's instrumental over Jellyfin's plain lines", () => {
    expect(chooseLyrics(plain('jf'), instrumental)).toEqual({
      status: 'instrumental',
      source: 'lrclib',
      lines: [],
    });
  });

  it("takes Jellyfin's plain lines over LRCLIB's plain ones, or when LRCLIB was not asked", () => {
    for (const lrclib of [plain('lrclib'), none, null]) {
      expect(chooseLyrics(plain('jf'), lrclib)).toEqual({ ...plain('jf'), source: 'jellyfin' });
    }
  });

  it("takes LRCLIB's plain lines when Jellyfin has none", () => {
    expect(chooseLyrics(none, plain('lrclib'))).toEqual({ ...plain('lrclib'), source: 'lrclib' });
  });

  it('answers none, from no source, when neither has lyrics', () => {
    for (const lrclib of [none, null]) {
      expect(chooseLyrics(none, lrclib)).toEqual({ status: 'none', source: null, lines: [] });
    }
  });
});

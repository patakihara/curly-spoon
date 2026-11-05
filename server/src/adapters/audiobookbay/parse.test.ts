import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recordingSchema } from '../http/recording.js';
import { parseDetail } from './parse.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = recordingSchema.parse(
  JSON.parse(readFileSync(join(here, 'recordings', 'detail.json'), 'utf8')),
);
const body = recorded.response.body;
if (body === null || !('text' in body)) throw new Error('the detail page is recorded as text');
const page = body.text;

describe("[M3.books] AudiobookBay's detail page", () => {
  it('[M3.books] gives the narrator, bitrate, format and hash from the recorded markup', () => {
    const extras = parseDetail(page);
    expect(extras.narrators?.length).toBeGreaterThan(0);
    expect(extras.bitrateKbps).toBe(128);
    expect(extras.format).toBe('m4b');
    expect(extras.infoHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(['', 'not html at all', '<html><body><p>Nothing here</p></body></html>', '<<<>>>'])(
    '[M3.books] gives nothing and no failure for junk: %j',
    (junk) => {
      expect(parseDetail(junk)).toEqual({});
    },
  );

  it('[M3.books] gives no narrator where the page does not know one', () => {
    const unknown = page.replace(
      /(<span class="narrator"[^>]*>)[^<]*(<\/span>)/g,
      (_all, open: string, close: string) => `${open}Unknown${close}`,
    );
    expect(parseDetail(unknown).narrators).toBeUndefined();
    expect(parseDetail(unknown).format).toBe('m4b');
  });

  it('[M3.books] gives no hash that is not one, and no bitrate that is not a number', () => {
    const bad = page
      .replace(/(Info Hash:<\/td>\s*<td>)[0-9a-fA-F]{40}/, '$1short')
      .replace(/(<span class="bitrate"[^>]*>)[^<]*/, '$1?? Kbps');
    expect(parseDetail(bad).infoHash).toBeUndefined();
    expect(parseDetail(bad).bitrateKbps).toBeUndefined();
  });

  it('[M3.books] reads a hostile page without holding up the server', () => {
    const started = performance.now();
    expect(parseDetail('<span '.repeat(32_000))).toEqual({});
    expect(performance.now() - started).toBeLessThan(500);
  });

  it.each([
    ['unclosed tags', '<span '],
    ['unclosed classes', '<span class="narrator" '],
    ['a class with no end', '<span class="'],
    ['tags with no text after', '<span class="format">'],
    ['hash labels with no hash', 'Info Hash:</td><td '],
    ['space after a label', 'Info Hash:     '],
  ])('[M3.books] takes linear time over a capped page of %s', (_name, piece) => {
    const page = piece.repeat(Math.ceil((2 * 1024 * 1024) / piece.length));
    const started = performance.now();
    parseDetail(page);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('[M3.books] reads the first usable format and bitrate, spaced or not', () => {
    const page =
      '<span class="format"> not one </span><span class="format">\n M4B </span>' +
      '<span class="x" class="bitrate"> 64 kbps </span>';
    expect(parseDetail(page)).toEqual({ format: 'm4b' });
    expect(parseDetail('<span class="bitrate"> 64 kbps </span>')).toEqual({ bitrateKbps: 64 });
  });
});

/**
 * A rewrite keeps the audio sharing the source's disk blocks: the new head ends where the old audio
 * started modulo 4 KiB, the bytes up to the first 4 KiB boundary are written, and the aligned rest
 * is asked of a range clone, else copied.
 */
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CloneRange, pythonCloneRange, type RangeClone } from './cloneRange.js';
import { BLOCK_SIZE, REWRITE_PADDING, rewrite, rewritePadding } from './rewrite.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-rewrite-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A file of `head` bytes of old metadata, then `audio` bytes of a counting pattern. */
function source(head: number, audio: number): { path: string; bytes: Buffer } {
  const bytes = Buffer.alloc(head + audio);
  for (let i = head; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
  const path = join(dir, 'track');
  writeFileSync(path, bytes, { mode: 0o640 });
  return { path, bytes };
}

/** A clone that records what it was asked, and does it by copying (or refuses). */
function recording(answer: 'clones' | 'refuses') {
  const asked: { source: string; target: string; range: CloneRange }[] = [];
  const clone: RangeClone = async (from, to, range) => {
    asked.push({ source: from, target: to, range });
    if (answer === 'refuses') return false;
    const bytes = readFileSync(from).subarray(
      range.sourceOffset,
      range.sourceOffset + range.length,
    );
    const target = readFileSync(to);
    writeFileSync(to, Buffer.concat([target.subarray(0, range.targetOffset), bytes]));
    return true;
  };
  return { asked, clone };
}

describe('[M3.albums] a rewrite’s padding', () => {
  it('[M3.albums] is at least 8 KiB and ends the head where the audio began, modulo 4 KiB', () => {
    for (const [head, from] of [
      [0, 0],
      [100, 37],
      [5000, 4096],
      [4096, 4095],
      [12_345, 99_999],
    ] as const) {
      const padding = rewritePadding(head, from);
      expect(padding).toBeGreaterThanOrEqual(REWRITE_PADDING);
      expect(padding).toBeLessThan(REWRITE_PADDING + BLOCK_SIZE);
      expect((head + padding) % BLOCK_SIZE).toBe(from % BLOCK_SIZE);
    }
  });
});

describe('[M3.albums] a rewrite with its audio aligned', () => {
  const HEAD = 1000;
  const AUDIO = 50_000;
  const head = Buffer.alloc(HEAD + 4096 * 2, 0xaa);

  it('[M3.albums] writes the head and the bytes up to the first 4 KiB boundary, and clones the rest', async () => {
    const { path, bytes } = source(HEAD, AUDIO);
    const { asked, clone } = recording('clones');
    await rewrite(path, head, HEAD, clone);
    expect(asked).toHaveLength(1);
    const { range, source: from } = asked[0]!;
    expect(from).toBe(path);
    expect(range).toEqual({
      sourceOffset: 4096,
      length: HEAD + AUDIO - 4096,
      targetOffset: head.length + (4096 - HEAD),
    });
    expect(range.targetOffset % BLOCK_SIZE).toBe(0);
    expect(readFileSync(path).equals(Buffer.concat([head, bytes.subarray(HEAD)]))).toBe(true);
  });

  it('[M3.albums] copies the rest when the clone is refused, the file the same', async () => {
    const { path, bytes } = source(HEAD, AUDIO);
    const { asked, clone } = recording('refuses');
    await rewrite(path, head, HEAD, clone);
    expect(asked).toHaveLength(1);
    expect(readFileSync(path).equals(Buffer.concat([head, bytes.subarray(HEAD)]))).toBe(true);
  });

  it('[M3.albums] copies the rest through the real clone where the filesystem has none', async () => {
    const { path, bytes } = source(HEAD, AUDIO);
    await rewrite(path, head, HEAD, pythonCloneRange());
    expect(readFileSync(path).equals(Buffer.concat([head, bytes.subarray(HEAD)]))).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o640);
  });

  it('[M3.albums] asks no clone when the audio ends before a 4 KiB boundary', async () => {
    const { path, bytes } = source(HEAD, 2000);
    const { asked, clone } = recording('clones');
    await rewrite(path, head, HEAD, clone);
    expect(asked).toEqual([]);
    expect(readFileSync(path).equals(Buffer.concat([head, bytes.subarray(HEAD)]))).toBe(true);
  });

  it('[M3.albums] asks no clone when the head would not leave the audio aligned', async () => {
    const { path, bytes } = source(HEAD, AUDIO);
    const { asked, clone } = recording('clones');
    const unaligned = Buffer.alloc(head.length + 1, 0xbb);
    await rewrite(path, unaligned, HEAD, clone);
    expect(asked).toEqual([]);
    expect(readFileSync(path).equals(Buffer.concat([unaligned, bytes.subarray(HEAD)]))).toBe(true);
  });
});

/**
 * Durations on the fixture album (scripts/fixtures/album.mjs). The expected values are what
 * Jellyfin's own ffprobe printed for these files on mediaserver (10 Nov, the files piped or copied
 * to /tmp and removed).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { audioDurationMs, mpegFrame } from './duration.js';

const here = dirname(fileURLToPath(import.meta.url));
const ALBUM = join(here, '..', '..', 'requests', 'albums', 'fixtures', 'the-slip');

/** The Slip's CD release on MusicBrainz, ms. */
const LENGTHS = [85586, 236133, 229560, 259200, 285106, 295560, 209680, 453520, 277813, 299400];
const NAMES = [
  '01 - 999,999',
  '02 - 1,000,000',
  '03 - Letting You',
  '04 - Discipline',
  '05 - Echoplex',
  '06 - Head Down',
  '07 - Lights in the Sky',
  '08 - Corona Radiata',
  '09 - The Four of Us Are Dying',
  '10 - Demon Seed',
];

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-duration-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('[M3.albums] how long a track plays', () => {
  it('[M3.albums] is a FLAC’s samples over its rate, within 1 ms of ffprobe', async () => {
    expect(await audioDurationMs(join(ALBUM, '01 - 999,999.flac'))).toBeCloseTo(85586.009, 0);
    expect(await audioDurationMs(join(ALBUM, '03 - Letting You.flac'))).toBeCloseTo(229560, 0);
    for (const [i, name] of NAMES.entries()) {
      const ms = await audioDurationMs(join(ALBUM, `${name}.flac`));
      expect(Math.abs(ms! - LENGTHS[i]!)).toBeLessThan(1);
    }
  });

  it('[M3.albums] is an MP3’s Info frame count times 1,152 samples, within 1 ms of ffprobe', async () => {
    expect(await audioDurationMs(join(ALBUM, '01 - 999,999.mp3'))).toBeCloseTo(85603.265, 0);
  });

  it('[M3.albums] is an MP3’s bytes over its bit rate when no frame counts them', async () => {
    const source = readFileSync(join(ALBUM, '01 - 999,999.mp3'));
    const tagLength = source.indexOf(Buffer.from([0xff, 0xfb]));
    expect(tagLength).toBeGreaterThan(10);
    const info = mpegFrame(source, tagLength)!;
    const path = join(dir, 'cbr.mp3');
    writeFileSync(
      path,
      Buffer.concat([source.subarray(0, tagLength), source.subarray(tagLength + info.length)]),
    );
    const audioBytes = source.length - tagLength - info.length - 128;
    expect(await audioDurationMs(path)).toBeCloseTo((audioBytes * 8) / 32, 6);
  });

  it('[M3.albums] is unknown for a file that is neither', async () => {
    expect(await audioDurationMs(join(ALBUM, 'cover.jpg'))).toBeNull();
    expect(await audioDurationMs(join(ALBUM, 'The Slip.log'))).toBeNull();
  });
});

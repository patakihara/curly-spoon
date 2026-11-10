import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { replayFetch } from './http/replay.js';
import { MUSICBRAINZ_GAP_MS } from './musicbrainz/client.js';
import {
  ALBUM_GROUP_GAP_MS,
  BUSY_TRIES,
  recordAlbumGroups,
  recordMusicBrainz,
} from './record-musicbrainz.js';

const adapters = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, 'musicbrainz', 'recordings', `${call}.json`), 'utf8')),
  );
const CALLS = [
  'release-search-mama-africa',
  'release-mama-africa',
  'release-search-dame-tu-cosita',
  'release-dame-tu-cosita',
  'release-search-staying-alive',
  'recording-search-stallone',
  'release-staying-alive',
  'recording-search-none',
];

describe('[M3.keep] re-recording MusicBrainz asks politely', () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('[M3.keep] never asks two calls at once, and a run that meets no 503 keeps the committed file', async () => {
    root = await mkdtemp(join(tmpdir(), 'auralis-mb-'));
    const replay = replayFetch(CALLS.map(recorded));
    let inFlight = 0;
    let mostInFlight = 0;
    let asked = 0;
    const fetch: FetchLike = async (url, init) => {
      asked += 1;
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      try {
        return await replay(url, init);
      } finally {
        inFlight -= 1;
      }
    };
    const lines: string[] = [];
    let now = 0;
    const { written } = await recordMusicBrainz({
      fetch,
      out: (line) => lines.push(line),
      root,
      musicBrainzUrl: 'http://upstream.invalid',
      clock: { now: () => now, sleep: async (ms) => void (now += ms) },
    });
    expect(mostInFlight).toBe(1);
    expect(asked).toBe(CALLS.length + BUSY_TRIES);
    expect(written.some((path) => path.endsWith('search-503.json'))).toBe(false);
    const files = await readdir(join(root, 'musicbrainz', 'recordings'));
    expect(files).not.toContain('search-503.json');
    expect(lines.at(-1)).toMatch(/never busy .* the committed file is kept/);
  });
});

const ALBUM_CALLS = [
  'rg-slip',
  'releases-slip',
  'rg-ghosts',
  'releases-ghosts',
  'rg-artificial-heart',
  'releases-artificial-heart',
  'rg-gone',
  'release-slip-cd',
  'release-ghosts-digital',
  'rg-search-slip',
  'rg-search-nin',
];

describe("[M3.albums] re-recording MusicBrainz's release groups asks politely", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('[M3.albums] asks one call at a time, each well after the one before, and cuts search rows to what is read', async () => {
    root = await mkdtemp(join(tmpdir(), 'auralis-mb-'));
    const replay = replayFetch(ALBUM_CALLS.map(recorded));
    let now = 0;
    const started: number[] = [];
    let inFlight = 0;
    let mostInFlight = 0;
    const fetch: FetchLike = async (url, init) => {
      started.push(now);
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      try {
        return await replay(url, init);
      } finally {
        inFlight -= 1;
      }
    };
    const { written } = await recordAlbumGroups({
      fetch,
      out: () => undefined,
      root,
      musicBrainzUrl: 'http://upstream.invalid',
      clock: { now: () => now, sleep: async (ms) => void (now += ms) },
    });
    expect(mostInFlight).toBe(1);
    expect(started).toHaveLength(ALBUM_CALLS.length);
    for (let i = 1; i < started.length; i += 1) {
      expect(started[i]! - started[i - 1]!).toBeGreaterThanOrEqual(
        Math.max(ALBUM_GROUP_GAP_MS, MUSICBRAINZ_GAP_MS),
      );
    }
    expect(written.map((path) => path.split('/').at(-1))).toEqual(
      ALBUM_CALLS.map((call) => `${call}.json`),
    );
    const search = JSON.parse(
      await readFile(join(root, 'musicbrainz', 'recordings', 'rg-search-nin.json'), 'utf8'),
    ) as { response: { body: { json: { 'release-groups': Record<string, unknown>[] } } } };
    for (const row of search.response.body.json['release-groups']) {
      expect(Object.keys(row)).not.toContain('tags');
      expect(Object.keys(row)).not.toContain('releases');
    }
  });
});

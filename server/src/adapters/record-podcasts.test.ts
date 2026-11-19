import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { replayFetch } from './http/replay.js';
import { scanRecording } from './http/scan.js';
import { ITUNES_GAP_MS } from './itunes/client.js';
import { ITUNES_RECORD_GAP_MS, ITUNES_SEARCHES, recordItunes } from './record-podcasts.js';

const adapters = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, 'itunes', 'recordings', `${call}.json`), 'utf8')),
  );
const CALLS = Object.keys(ITUNES_SEARCHES);

describe("[M3.podcasts] re-recording iTunes' podcast search asks politely", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('[M3.podcasts] the committed recordings hold no leak', () => {
    for (const call of CALLS) expect(scanRecording(recorded(call)), call).toEqual([]);
  });

  it('[M3.podcasts] asks one call at a time, each well after the one before, and keeps only the fields parsed', async () => {
    root = await mkdtemp(join(tmpdir(), 'auralis-itunes-'));
    const replay = replayFetch(CALLS.map(recorded));
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
    const { written } = await recordItunes({
      fetch,
      out: () => undefined,
      root,
      itunesUrl: 'http://upstream.invalid',
      clock: { now: () => now, sleep: async (ms) => void (now += ms) },
    });
    expect(mostInFlight).toBe(1);
    expect(started).toHaveLength(CALLS.length);
    for (let i = 1; i < started.length; i += 1) {
      expect(started[i]! - started[i - 1]!).toBeGreaterThanOrEqual(
        Math.max(ITUNES_RECORD_GAP_MS, ITUNES_GAP_MS),
      );
    }
    expect(written.map((path) => path.split('/').at(-1))).toEqual(
      CALLS.map((call) => `${call}.json`),
    );
    expect((await readdir(join(root, 'itunes', 'recordings'))).sort()).toEqual(
      CALLS.map((call) => `${call}.json`).sort(),
    );
    const history = JSON.parse(
      await readFile(join(root, 'itunes', 'recordings', 'search-history.json'), 'utf8'),
    ) as { response: { body: { text: string } } };
    const rows = (JSON.parse(history.response.body.text) as { results: object[] }).results;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('collectionViewUrl');
      expect(Object.keys(row)).not.toContain('artworkUrl100');
    }
  });
});

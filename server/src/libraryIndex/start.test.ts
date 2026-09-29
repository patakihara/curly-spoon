import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../adapters/http/fetch.js';
import type { Job } from '../jobs/schedule.js';
import { openDatabase, type Db } from '../store/connection.js';
import { startIndexJob } from './start.js';

let db: Db;
let keys: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  keys = mkdtempSync(join(tmpdir(), 'auralis-index-keys-'));
  for (const name of ['abs-index', 'jellyfin']) writeFileSync(join(keys, name), 'test-key\n');
});
afterEach(() => db.close());

const upstreams = () => ({
  abs: { url: 'http://abs.upstream.invalid', keyFile: join(keys, 'abs-provision') },
  jellyfin: { url: 'http://jellyfin.upstream.invalid', keyFile: join(keys, 'jellyfin') },
});

function start(index: { everyMinutes: number; absKeyFile: string | null }, fetch: FetchLike) {
  const jobs: Job[] = [];
  const log = { error: vi.fn() };
  const stop = startIndexJob(
    { ...upstreams(), index },
    { db, fetch, log, schedule: (job) => (jobs.push(job), () => undefined) },
  );
  return { jobs, stop, log };
}

const nothing: FetchLike = async () => {
  throw new Error('no network in this test');
};

describe('starting the index job with the server', () => {
  it('schedules nothing when INDEX_EVERY_MINUTES is 0', () => {
    expect(start({ everyMinutes: 0, absKeyFile: join(keys, 'abs-index') }, nothing).jobs).toEqual(
      [],
    );
  });

  it('schedules the index at its interval, reading each upstream with its own key', async () => {
    const asked: { url: string; authorization: string | null }[] = [];
    const fetch: FetchLike = async (url, init) => {
      asked.push({ url, authorization: new Headers(init?.headers).get('authorization') });
      return new Response('{}', { status: 500 });
    };
    const { jobs } = start({ everyMinutes: 30, absKeyFile: join(keys, 'abs-index') }, fetch);
    expect(jobs.map((j) => [j.name, j.everyMs])).toEqual([['index', 30 * 60_000]]);

    await expect(jobs[0]!.run()).rejects.toThrow(/abs: .*jellyfin: /);
    expect(asked.map((a) => new URL(a.url).host)).toEqual([
      'abs.upstream.invalid',
      'jellyfin.upstream.invalid',
    ]);
    expect(asked[0]?.authorization).toBe('Bearer test-key');
    expect(asked[1]?.authorization).toMatch(/Token="test-key"/);
  });

  it('reads the listen-only key from the ABS_API_KEY line of the shared keys file', async () => {
    const shared = join(keys, 'upstream-keys.env');
    writeFileSync(
      shared,
      'ABS_API_KEY=listen-key\nABS_PROVISION_KEY=admin-key\nJELLYFIN_API_KEY=jf-key\n',
    );
    const asked: { host: string; authorization: string | null }[] = [];
    const fetch: FetchLike = async (url, init) => {
      asked.push({
        host: new URL(url).host,
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return new Response('{}', { status: 500 });
    };
    const { jobs } = start({ everyMinutes: 60, absKeyFile: shared }, fetch);
    await expect(jobs[0]!.run()).rejects.toThrow(/abs: /);
    expect(asked.find((a) => a.host === 'abs.upstream.invalid')?.authorization).toBe(
      'Bearer listen-key',
    );
  });

  it('indexes Jellyfin alone when no listen-only Audiobookshelf key is configured', async () => {
    const asked: string[] = [];
    const fetch: FetchLike = async (url) => {
      asked.push(new URL(url).host);
      return new Response('{}', { status: 500 });
    };
    const { jobs } = start({ everyMinutes: 60, absKeyFile: null }, fetch);
    await expect(jobs[0]!.run()).rejects.toThrow(/^jellyfin: /);
    expect(asked).toEqual(['jellyfin.upstream.invalid']);
  });
});

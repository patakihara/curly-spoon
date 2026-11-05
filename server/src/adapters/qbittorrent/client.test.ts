import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { QbittorrentClient } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(here, 'recordings', `${call}.json`), 'utf8')));

const client = (fetch: FetchLike, apiKey = '<token>') =>
  new QbittorrentClient({ baseUrl: 'http://upstream.invalid', apiKey, fetch });

describe('[M3.books] the qBittorrent client', () => {
  it('[M3.books] names itself by its key on every call, with no login and no cookie', async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const replay = replayFetch([recorded('version')]);
    const fetch: FetchLike = (url, init) => {
      seen.push({ url, headers: new Headers(init?.headers) });
      return replay(url, init);
    };
    expect(await client(fetch).version()).toBe(recorded('version').upstreamVersion);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer <token>');
    expect(seen[0]?.headers.has('cookie')).toBe(false);
    expect(seen[0]?.url).not.toContain('login');
  });

  it('[M3.books] a wrong key is refused, as recorded', async () => {
    const thrown = await client(replayFetch([recorded('unauthorized')]), 'not-the-key')
      .version()
      .catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(AdapterError);
    expect((thrown as AdapterError).status).toBe(403);
  });

  it('[M3.books] a row by another category or without the tag is not ours, whatever was asked', async () => {
    const one = recorded('info-by-tag');
    const rows = (one.response.body as { json: Record<string, unknown>[] }).json;
    const altered = rows.map((row, at) =>
      at === 0 ? { ...row, category: 'a-household-category' } : { ...row, tags: 'another-tag' },
    );
    const fetch = replayFetch([{ ...one, response: { ...one.response, body: { json: altered } } }]);
    expect(await client(fetch).withTag('auralis-record', 'auralis-books')).toEqual([]);
  });

  it('[M3.books] an add that reports a failure throws', async () => {
    const one = recorded('add-magnet');
    const body = { json: { failure_count: 1, pending_count: 0, success_count: 0 } };
    const fetch = replayFetch([{ ...one, response: { ...one.response, body } }]);
    const torrent = { kind: 'magnet', magnet: 'magnet:?', hash: 'a' } as const;
    await expect(
      client(fetch).add({ torrent, category: 'a-category', tag: 'a-tag' }),
    ).rejects.toThrow(/not added/);
  });

  it('[M3.books] torrent bytes go as a file, with the same fields as a magnet', async () => {
    const sent: unknown[] = [];
    const replay = replayFetch([recorded('add-magnet')]);
    const fetch: FetchLike = (url, init) => {
      sent.push(init?.body);
      return replay(url, init);
    };
    const torrent = { kind: 'torrent', bytes: new Uint8Array([1, 2]), hash: 'a' } as const;
    await client(fetch).add({ torrent, category: 'a-category', tag: 'a-tag' });
    const form = sent[0] as FormData;
    expect(form.get('category')).toBe('a-category');
    expect(form.get('tags')).toBe('a-tag');
    expect((form.get('torrents') as File).size).toBe(2);
  });

  it('[M3.books] a finished torrent lists its files', async () => {
    const hash = recorded('files').request.query.hash as string;
    const files = await client(replayFetch([recorded('files')])).files(hash);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]?.size).toBeGreaterThan(0);
  });
});

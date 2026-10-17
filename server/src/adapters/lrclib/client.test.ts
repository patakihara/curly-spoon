import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { LRCLIB_MAX_BYTES, LRCLIB_USER_AGENT, LrclibClient } from './client.js';

const RECORD = {
  id: 7,
  name: 'A Song',
  trackName: 'A Song',
  artistName: 'A Band',
  albumName: 'An Album',
  duration: 201,
  instrumental: false,
  hasWordSync: false,
  plainLyrics: 'one\ntwo',
  syncedLyrics: '[00:01.00] one\n[00:02.50] two',
  lyricsfile: 'version: 1',
};

const QUERY = { artistName: 'A Band', trackName: 'A Song', albumName: 'An Album', duration: 201 };

function upstream(status = 200, body: unknown = RECORD) {
  const sent: { url: string; init: RequestInit | undefined }[] = [];
  const fetch: FetchLike = async (url, init) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = new LrclibClient({
    baseUrl: 'http://upstream.invalid',
    fetch,
    userAgent: LRCLIB_USER_AGENT,
  });
  return { client, sent };
}

describe('the LRCLIB client', () => {
  it("asks LRCLIB's matcher for one track by its artist, title, album and length in seconds", async () => {
    const { client, sent } = upstream();
    await client.get(QUERY);
    const url = new URL(sent[0]?.url ?? '');
    expect(url.pathname).toBe('/api/get');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      artist_name: 'A Band',
      track_name: 'A Song',
      album_name: 'An Album',
      duration: '201',
    });
  });

  it('names Auralis, its version and its homepage in the User-Agent, as LRCLIB asks', async () => {
    const { client, sent } = upstream();
    await client.get(QUERY);
    const headers = new Headers(sent[0]?.init?.headers);
    expect(headers.get('user-agent')).toBe(LRCLIB_USER_AGENT);
    expect(LRCLIB_USER_AGENT).toMatch(/^Auralis\/\d+\.\d+\.\d+ \(\+https:\/\/\S+\)$/);
    expect(headers.get('accept')).toBe('application/json');
  });

  it('answers the record with only the fields Auralis reads', async () => {
    const { client } = upstream();
    expect(await client.get(QUERY)).toEqual({
      id: 7,
      trackName: 'A Song',
      artistName: 'A Band',
      albumName: 'An Album',
      duration: 201,
      instrumental: false,
      plainLyrics: 'one\ntwo',
      syncedLyrics: '[00:01.00] one\n[00:02.50] two',
    });
  });

  it('answers an instrumental record with no lyrics of either kind', async () => {
    const instrumental = { ...RECORD, instrumental: true, plainLyrics: null, syncedLyrics: null };
    const { client } = upstream(200, instrumental);
    expect(await client.get(QUERY)).toMatchObject({
      instrumental: true,
      plainLyrics: null,
      syncedLyrics: null,
    });
  });

  it('answers null when LRCLIB finds no such track', async () => {
    const notFound = { message: 'Failed to find specified track', name: 'TrackNotFound' };
    const { client } = upstream(404, { ...notFound, statusCode: 404 });
    expect(await client.get(QUERY)).toBeNull();
  });

  it('fails as its status when LRCLIB is busy or refuses, naming the call', async () => {
    for (const status of [400, 429, 500, 503]) {
      const { client } = upstream(status, { message: 'The server is busy', statusCode: status });
      const failure = (await client.get(QUERY).catch((e: unknown) => e)) as AdapterError;
      expect(failure).toBeInstanceOf(AdapterError);
      expect([failure.kind, failure.status]).toEqual(['status', status]);
      expect(failure.message).toContain('GET /api/get');
    }
  });

  it('fails as a parse error when the record is not the shape LRCLIB answers', async () => {
    const { client } = upstream(200, { ...RECORD, id: 'seven' });
    const failure = (await client.get(QUERY).catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('parse');
  });

  it(`refuses a body larger than ${LRCLIB_MAX_BYTES} bytes`, async () => {
    const huge = { ...RECORD, plainLyrics: 'x'.repeat(LRCLIB_MAX_BYTES) };
    const { client } = upstream(200, huge);
    const failure = (await client.get(QUERY).catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('parse');
    expect(failure.message).toContain('larger than');
  });

  it('gives up after its own time limit, when one is set', async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = new LrclibClient({
      baseUrl: 'http://upstream.invalid',
      fetch,
      userAgent: LRCLIB_USER_AGENT,
      timeoutMs: 5,
    });
    const failure = (await client.get(QUERY).catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('timeout');
  });

  it("gives up after one call's own time limit, over the client's", async () => {
    const fetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const client = new LrclibClient({
      baseUrl: 'http://upstream.invalid',
      fetch,
      userAgent: LRCLIB_USER_AGENT,
      timeoutMs: 60_000,
    });
    const failure = (await client
      .get(QUERY, { timeoutMs: 5 })
      .catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('timeout');
  });
});

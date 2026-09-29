import { describe, expect, it } from 'vitest';
import { AbsClient } from '../audiobookshelf/client.js';
import { type Recording } from './recording.js';
import { replayFetch } from './replay.js';

const libraryList: Recording = {
  upstream: 'audiobookshelf',
  upstreamVersion: '2.36.1',
  call: 'library-list',
  request: {
    method: 'GET',
    path: '/api/libraries',
    query: {},
    headers: { accept: 'application/json', authorization: 'Bearer <token>' },
    body: null,
  },
  response: {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: { json: { libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] } },
  },
};

const client = () =>
  new AbsClient({
    baseUrl: 'http://upstream.invalid',
    token: '<token>',
    fetch: replayFetch([libraryList]),
  });

describe('replaying recordings', () => {
  it('a recording replays through an injected fetch and the client parses it', async () => {
    const libraries = await client().getLibraries();
    expect(libraries).toEqual([{ id: 'lib1', name: 'Books', mediaType: 'book' }]);
  });

  it('an unrecorded request fails, naming its method and path', async () => {
    await expect(client().getItem('li_1')).rejects.toThrow(/GET \/api\/items\/li_1/);
  });

  it('query order does not matter when matching a recording', async () => {
    const fetch = replayFetch([
      { ...libraryList, request: { ...libraryList.request, query: { a: '1', b: '2' } } },
    ]);
    const res = await fetch('http://upstream.invalid/api/libraries?b=2&a=1');
    expect(res.status).toBe(200);
  });
});

const itemFile: Recording = {
  upstream: 'audiobookshelf',
  upstreamVersion: '2.36.1',
  call: 'item-file',
  request: {
    method: 'GET',
    path: '/api/items/li_1/file/7',
    query: {},
    headers: { authorization: 'Bearer <token>', range: 'bytes=0-1' },
    body: null,
  },
  response: {
    status: 206,
    headers: {
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-1/158919642',
      'content-type': 'audio/mp4',
    },
    body: { bytes: 'item-file.m4a', synthesized: 'a tone' },
  },
};

/** A 1,000-byte stand-in: byte i is i mod 251, so any slice is recognisable. */
const STAND_IN = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
const fileFetch = () =>
  replayFetch([itemFile], {
    readBytes: (recording, name) => {
      expect([recording.upstream, name]).toEqual(['audiobookshelf', 'item-file.m4a']);
      return STAND_IN;
    },
  });
const FILE_URL = 'http://upstream.invalid/api/items/li_1/file/7';
const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());

describe('replaying a file call from its stand-in', () => {
  it('a range request answers 206 with that slice, and the length and range recomputed', async () => {
    const res = await fileFetch()(FILE_URL, { headers: { range: 'bytes=100-199' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('audio/mp4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(res.headers.get('content-length')).toBe('100');
    expect(await bytesOf(res)).toEqual(STAND_IN.slice(100, 200));
  });

  it('an open-ended range and a suffix range each answer the right slice', async () => {
    const open = await fileFetch()(FILE_URL, { headers: { range: 'bytes=990-' } });
    expect(open.headers.get('content-range')).toBe('bytes 990-999/1000');
    expect(await bytesOf(open)).toEqual(STAND_IN.slice(990));
    const suffix = await fileFetch()(FILE_URL, { headers: { range: 'bytes=-5' } });
    expect(suffix.headers.get('content-range')).toBe('bytes 995-999/1000');
    expect(await bytesOf(suffix)).toEqual(STAND_IN.slice(995));
  });

  it('a range ending past the file is cut at its end', async () => {
    const res = await fileFetch()(FILE_URL, { headers: { range: 'bytes=900-5000' } });
    expect(res.headers.get('content-range')).toBe('bytes 900-999/1000');
  });

  it('a request without a range answers 200 with the whole file and no content-range', async () => {
    const res = await fileFetch()(FILE_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-range')).toBeNull();
    expect(res.headers.get('content-length')).toBe('1000');
    expect(await bytesOf(res)).toEqual(STAND_IN);
  });

  it('a range starting past the end answers 416 naming the size', async () => {
    const res = await fileFetch()(FILE_URL, { headers: { range: 'bytes=1000-' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */1000');
  });

  it('a stand-in body with no way to read it fails, naming the file', async () => {
    await expect(replayFetch([itemFile])(FILE_URL)).rejects.toThrow(/item-file\.m4a/);
  });
});

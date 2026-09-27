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

import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import {
  loadItem,
  loadLibrary,
  loadList,
  loadLists,
  loadPodcasts,
  loadQueues,
  loadSearch,
  loadSuggest,
} from './loads';
import { SignedOut } from './store';

/** An API answering each path from `answers` (anything else 404), recording each ask. */
function api(answers: Record<string, [number, unknown]>) {
  const asked: string[] = [];
  const client = createApiClient({
    baseUrl: 'http://auralis.test',
    fetch: async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      asked.push(path);
      const [status, body] = answers[path] ?? [404, { error: 'not_found' }];
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { client, asked };
}

const queue = (type: string) => ({
  type,
  current: null,
  position: null,
  user: [],
  context: null,
  digest: null,
  rev: 0,
  autoplay: null,
  played: [],
});

const session = (over: object) => ({
  deviceId: 'd1',
  deviceName: 'Web browser',
  thisDevice: true,
  active: 'spoken',
  switchAfterCurrent: null,
  queueStyle: 'youtube',
  currents: { music: null, spoken: null },
  rev: 0,
  updatedAt: 1,
  ...over,
});

describe('[M1.shell] what the pages read from the API', () => {
  it('reads a library list by its medium, parsed', async () => {
    const { client, asked } = api({ '/api/library/podcasts': [200, { items: [] }] });
    expect(await loadLibrary(client, 'podcasts')).toEqual({ items: [] });
    expect(asked).toEqual(['/api/library/podcasts']);
  });

  it('refuses an answer that does not parse', async () => {
    const { client } = api({ '/api/library/books': [200, { items: [{ title: 'x' }] }] });
    await expect(loadLibrary(client, 'books')).rejects.toThrow();
  });

  it('says a refusal for want of a sign-in is one', async () => {
    const { client } = api({ '/api/library/music': [401, { error: 'unauthenticated' }] });
    await expect(loadLibrary(client, 'music')).rejects.toBeInstanceOf(SignedOut);
  });

  it('asks for an item only by a ref, never for an address that names none', async () => {
    const { client, asked } = api({});
    await expect(loadItem(client, 'shadows-and-sighs')).rejects.toThrow();
    await expect(loadItem(client, undefined)).rejects.toThrow();
    expect(asked).toEqual([]);
    await expect(loadItem(client, 'abs:b1')).rejects.toThrow('answered 404');
    expect(asked).toEqual(['/api/items/abs:b1']);
  });

  it('reads the queue the controls drive, and the other one when the session moves over to it', async () => {
    const one = api({
      '/api/sessions': [200, { sessions: [session({ thisDevice: false }), session({})] }],
      '/api/queues/spoken': [200, queue('spoken')],
    });
    expect(await loadQueues(one.client)).toEqual({ active: queue('spoken'), then: null });
    const both = api({
      '/api/sessions': [200, { sessions: [session({ switchAfterCurrent: 'music' })] }],
      '/api/queues/spoken': [200, queue('spoken')],
      '/api/queues/music': [200, queue('music')],
    });
    expect(await loadQueues(both.client)).toEqual({
      active: queue('spoken'),
      then: queue('music'),
    });
  });

  it('reads no queue for a device with no session yet', async () => {
    const { client, asked } = api({ '/api/sessions': [200, { sessions: [] }] });
    expect(await loadQueues(client)).toBeNull();
    expect(asked).toEqual(['/api/sessions']);
  });
});

describe('what search reads from the API', () => {
  /** An API answering `body` to anything, recording each path asked for and its query. */
  function answering(body: unknown) {
    const asked: string[] = [];
    const client = createApiClient({
      baseUrl: 'http://auralis.test',
      fetch: async (request) => {
        const url = new URL(request.url);
        asked.push(`${url.pathname} ${JSON.stringify([...url.searchParams])}`);
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    return { client, asked };
  }

  it('asks for suggestions for what is typed, even nothing, parsed', async () => {
    const { client, asked } = answering({
      suggestions: [{ kind: 'recent', text: 'ri', ref: null }],
    });
    expect(await loadSuggest(client, 'ri')).toEqual({
      suggestions: [{ kind: 'recent', text: 'ri', ref: null }],
    });
    await loadSuggest(client, '');
    expect(asked).toEqual(['/api/search/suggest [["q","ri"]]', '/api/search/suggest [["q",""]]']);
  });

  it('asks for the results of a search, every kind of them, parsed', async () => {
    const { client, asked } = answering({ query: 'rise and', results: [] });
    expect(await loadSearch(client, 'rise and')).toEqual({ query: 'rise and', results: [] });
    expect(asked).toEqual(['/api/search [["q","rise and"]]']);
  });

  it('refuses suggestions that do not parse', async () => {
    const { client } = answering({ suggestions: [{ kind: 'nope', text: 'x', ref: null }] });
    await expect(loadSuggest(client, 'x')).rejects.toThrow();
  });
});

const listOf = (id: string, name: string) => ({
  id,
  kind: 'playlist',
  name,
  theDigest: false,
  order: null,
  count: 0,
  counts: { book: 0, show: 0, episode: 0 },
  covers: [],
});

describe('[M2.lists] what the list pages read from the API', () => {
  it('[M2.lists] reads one list by its id, parsed', async () => {
    const { client, asked } = api({
      '/api/lists/l1': [200, { ...listOf('l1', 'Commute'), shows: [], items: [] }],
    });
    expect((await loadList(client, 'l1')).name).toBe('Commute');
    expect(asked).toEqual(['/api/lists/l1']);
  });

  it('[M2.lists] reads no list for an address that names none', async () => {
    const { client, asked } = api({});
    await expect(loadList(client, undefined)).rejects.toThrow();
    expect(asked).toEqual([]);
  });

  it('[M2.lists] reads your lists, The Digest first, in one ask, opening none of them', async () => {
    const { client, asked } = api({
      '/api/lists': [200, { lists: [listOf('d', 'The Digest'), listOf('l1', 'Commute')] }],
    });
    expect((await loadLists(client)).map((l) => l.name)).toEqual(['The Digest', 'Commute']);
    expect(asked).toEqual(['/api/lists']);
  });

  it('[M2.lists] throws SignedOut when your lists are refused for want of a sign-in', async () => {
    const { client } = api({ '/api/lists': [401, { error: 'signed_out' }] });
    await expect(loadLists(client)).rejects.toBeInstanceOf(SignedOut);
  });
});

describe('[M2.lists] what the Podcasts page reads from the API', () => {
  const shows = { items: [] };

  it('[M2.lists] reads your shows and your lists', async () => {
    const { client } = api({
      '/api/library/podcasts': [200, shows],
      '/api/lists': [200, { lists: [listOf('d', 'The Digest')] }],
    });
    const loaded = await loadPodcasts(client);
    expect(loaded.library.items).toEqual([]);
    expect(loaded.lists?.map((l) => l.name)).toEqual(['The Digest']);
  });

  it('[M2.lists] still reads your shows when your lists fail, saying the lists failed', async () => {
    const { client } = api({
      '/api/library/podcasts': [200, shows],
      '/api/lists': [500, { error: 'internal' }],
    });
    expect(await loadPodcasts(client)).toEqual({ library: { items: [] }, lists: null });
  });

  it('[M2.lists] throws SignedOut when your lists are refused for want of a sign-in, and fails when your shows do', async () => {
    const signedOut = api({
      '/api/library/podcasts': [200, shows],
      '/api/lists': [401, { error: 'signed_out' }],
    });
    await expect(loadPodcasts(signedOut.client)).rejects.toBeInstanceOf(SignedOut);
    const noShows = api({ '/api/lists': [200, { lists: [] }] });
    await expect(loadPodcasts(noShows.client)).rejects.toThrow();
  });
});

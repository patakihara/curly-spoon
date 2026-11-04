import { describe, expect, it } from 'vitest';
import { createApiClient } from '../api/client';
import {
  feedOrNone,
  libraryAsk,
  loadFeed,
  loadItem,
  loadLibrary,
  loadList,
  loadLists,
  loadPodcasts,
  loadQueues,
  loadSearch,
  loadSuggest,
  settledAddress,
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
  currents: { music: null, spoken: null },
  rev: 0,
  updatedAt: 1,
  ...over,
});

describe('[M1.shell] what the pages read from the API', () => {
  it('reads a library list by its medium, parsed', async () => {
    const empty = { items: [], requested: [], sort: 'title', seed: null };
    const { client, asked } = api({ '/api/library/podcasts': [200, empty] });
    expect(await loadLibrary(client, 'podcasts')).toEqual(empty);
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
  const shows = { items: [], requested: [], sort: 'title', seed: null };

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
    expect(await loadPodcasts(client)).toEqual({ library: shows, lists: null });
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

describe('[M2.sorting] the order a library home asks for, from its address', () => {
  it('[M2.sorting] asks for title, artist or random, and a seed only with random', () => {
    expect(libraryAsk({})).toEqual({});
    expect(libraryAsk({ sort: 'artist' })).toEqual({ sort: 'artist' });
    expect(libraryAsk({ sort: 'random', seed: '42' })).toEqual({ sort: 'random', seed: 42 });
    expect(libraryAsk({ sort: 'title', seed: '42' }), 'a kept seed is dropped').toEqual({
      sort: 'title',
    });
  });

  it('[M2.sorting] ignores a sort or seed the server would refuse, so the page still loads', () => {
    expect(libraryAsk({ sort: 'size' })).toEqual({});
    expect(libraryAsk({ sort: 'random', seed: '-1' })).toEqual({ sort: 'random' });
    expect(libraryAsk({ sort: 'random', seed: '1.5' })).toEqual({ sort: 'random' });
    expect(libraryAsk({ sort: 'random', seed: 'abc' })).toEqual({ sort: 'random' });
    expect(libraryAsk({ sort: 'random', seed: String(2 ** 32) })).toEqual({ sort: 'random' });
    expect(libraryAsk({ sort: 'random', seed: String(2 ** 32 - 1) })).toEqual({
      sort: 'random',
      seed: 2 ** 32 - 1,
    });
  });
});

describe('[M2.sorting] the address a shuffle settles on, once the server answers', () => {
  it('[M2.sorting] adds the seed the server drew to an address that asked for random without one', () => {
    expect(settledAddress({ sort: 'random' }, 7)).toEqual({ sort: 'random', seed: '7' });
    expect(settledAddress({ sort: 'random', seed: '-3' }, 9), 'a bad seed is replaced').toEqual({
      sort: 'random',
      seed: '9',
    });
  });

  it('[M2.sorting] leaves an address that already names the order answered, so it settles once', () => {
    expect(settledAddress({ sort: 'random', seed: '7' }, 7)).toBeNull();
    expect(settledAddress({ sort: 'artist' }, null)).toBeNull();
    expect(settledAddress({}, null)).toBeNull();
  });
});

describe('[M2.sorting] what the library homes and Browse read from the API', () => {
  /** An API answering each path from `answers`, recording each path asked for and its query. */
  function asking(answers: Record<string, [number, unknown]>) {
    const asked: string[] = [];
    const client = createApiClient({
      baseUrl: 'http://auralis.test',
      fetch: async (request) => {
        const url = new URL(request.url);
        asked.push(`${url.pathname}${url.search}`);
        const [status, body] = answers[url.pathname] ?? [404, { error: 'not_found' }];
        return new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      },
    });
    return { client, asked };
  }

  it('[M2.sorting] asks for a library list in the order asked, with its seed', async () => {
    const shuffled = { items: [], requested: [], sort: 'random', seed: 7 };
    const { client, asked } = asking({ '/api/library/books': [200, shuffled] });
    expect(await loadLibrary(client, 'books', { sort: 'random', seed: 7 })).toEqual(shuffled);
    await loadLibrary(client, 'books', {}).catch(() => undefined);
    expect(asked).toEqual(['/api/library/books?sort=random&seed=7', '/api/library/books']);
  });

  const card = {
    ref: { source: 'abs', id: 'e1' },
    kind: 'episode',
    title: 'Part Two',
    sub: 'A Show',
    art: '/api/media/abs:s1/art',
    progress: null,
    availability: { kind: 'owned' },
  };

  it("[M2.sorting] reads Browse's shelves, parsed", async () => {
    const feed = { shelves: [{ id: 'up-next', items: [card] }] };
    const { client, asked } = asking({ '/api/feed': [200, feed] });
    expect(await loadFeed(client)).toEqual(feed);
    expect(asked).toEqual(['/api/feed']);
  });

  it('[M2.sorting] reads no shelves when the feed fails, but a refusal for want of a sign-in still throws', async () => {
    expect(await feedOrNone(asking({ '/api/feed': [500, { error: 'internal' }] }).client)).toEqual({
      shelves: [],
    });
    expect(
      await feedOrNone(
        asking({ '/api/feed': [200, { shelves: [{ id: 'x', items: [] }] }] }).client,
      ),
      'an answer that does not parse is a failure',
    ).toEqual({ shelves: [] });
    await expect(
      feedOrNone(asking({ '/api/feed': [401, { error: 'signed_out' }] }).client),
    ).rejects.toBeInstanceOf(SignedOut);
  });
});

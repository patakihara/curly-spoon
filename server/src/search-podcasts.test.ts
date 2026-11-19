/**
 * Search's podcast rows through the real routes: iTunes answers from its recordings, a pasted feed
 * from the feed Auralis recorded, the requests' steps are stand-ins, and what the household holds
 * is written to the index as the index job does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestRef, SearchResults } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type FeedFetch, feedFetch } from './adapters/http/publicFetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { standInSteps } from './adapters/http/standIn.js';
import { ItunesClient } from './adapters/itunes/client.js';
import { buildApp } from './app.js';
import { type IndexRow } from './libraryIndex/rows.js';
import { applyRow, emptyCounts } from './libraryIndex/store.js';
import { stepsRegistry } from './requests/steps.js';
import { showCatalogue, type ShowCatalogue } from './search/podcasts.js';
import { followShow } from './store/claims.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { upsertUser } from './store/users.js';

const ADAPTERS = fileURLToPath(new URL('./adapters/', import.meta.url));
const recorded = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const ITUNES = ['search-maintenance-phase', 'search-history', 'search-none'].map((call) =>
  recorded('itunes', call),
);
const MAINTENANCE_PHASE = '1535408667';
const MAINTENANCE_FEED = 'https://rss.buzzsprout.com/1411126.rss';
const PASTED = 'https://feeds.example.com/public/shows/7db8dbf2-4b79-4d64-892a-d0d87f255834';
const T0 = Date.UTC(2026, 10, 18, 8);

/** A fetch that counts the hosts it is asked of, then answers as `fetch` does. */
function counted(fetch: FetchLike) {
  const hosts: string[] = [];
  const counting: FetchLike = async (url, init) => {
    hosts.push(new URL(url).hostname);
    return fetch(url, init);
  };
  return { fetch: counting, hosts };
}

/** The recorded feed, read as the guard would hand it over. */
const recordedFeed: FeedFetch = async (url, init) => ({
  response: await replayFetch([recorded('feed', 'subscribe-feed')])(url, init),
  url,
});

function indexedShow(db: Db, id: string, title: string, ids: Record<string, string>) {
  const row: IndexRow = {
    source: 'abs',
    id,
    kind: 'show',
    parentId: null,
    libraryId: 'podcasts',
    title,
    creators: [],
    series: [],
    genres: [],
    position: null,
    disc: null,
    duration: null,
    year: null,
    publishedAt: null,
    upstreamVersion: null,
    ids,
    episodeOrder: null,
    hasArt: false,
    hasLyrics: false,
  };
  applyRow(db, row, T0, emptyCounts());
}

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function server(
  options: {
    itunes?: FetchLike;
    feed?: FeedFetch;
    artFetch?: FetchLike;
    catalogue?: ShowCatalogue;
    logged?: unknown[];
  } = {},
) {
  const db = openDatabase(':memory:');
  const itunes = counted(options.itunes ?? replayFetch(ITUNES));
  const catalogue =
    options.catalogue ??
    showCatalogue({
      itunes: new ItunesClient({
        baseUrl: 'https://itunes.apple.com',
        fetch: itunes.fetch,
        clock: { now: () => T0, sleep: async () => undefined },
      }),
      feed: options.feed ?? recordedFeed,
      fetchArt: options.artFetch ?? (async () => new Response(null, { status: 500 })),
      log: { error: (...args: unknown[]) => options.logged?.push(args) },
    });
  const app = await buildApp({
    webDistDir: null,
    db,
    upstreams: {
      key: Buffer.alloc(32, 7),
      config: { absUrl: undefined, jellyfinUrl: undefined },
      fetch: replayFetch([]),
    },
    now: () => T0,
    logger: false,
    showCatalogue: catalogue,
    requests: {
      steps: stepsRegistry([standInSteps('podcast')]),
      everyMs: 3_600_000,
      notIndexedAfterMs: 60_000,
      stepTimeoutMs: 0,
      stallAfterMs: 60_000,
      holdAfterMs: 60_000,
    },
  });
  apps.push(app);
  const user = upsertUser(db, { username: 'kara', role: 'member' });
  const device = createDevice(db, { userId: user.id, kind: 'web' });
  const { token } = createSession(db, { userId: user.id, deviceId: device.id, kind: 'bearer' });
  const headers = { authorization: `Bearer ${token}` };
  const search = async (q: string, kinds = '') => {
    const url = `/api/search?q=${encodeURIComponent(q)}${kinds}`;
    const answer = await app.inject({ method: 'GET', url, headers });
    expect(answer.statusCode).toBe(200);
    return SearchResults.parse(answer.json());
  };
  return { app, db, user, headers, search, itunesHosts: itunes.hosts };
}

describe('[M3.podcasts] podcast rows in Search', () => {
  it('[M3.podcasts] lists the shows iTunes finds, each with a ref a request takes', async () => {
    const { search } = await server();
    const { podcasts } = await search('maintenance phase');
    expect(podcasts).toEqual([
      {
        ref: {
          medium: 'podcast',
          target: {
            title: 'Maintenance Phase',
            creator: 'Aubrey Gordon & Michael Hobbes',
            ids: { feedUrl: MAINTENANCE_FEED, itunesId: MAINTENANCE_PHASE },
          },
        },
        title: 'Maintenance Phase',
        host: 'Aubrey Gordon & Michael Hobbes',
        episodes: 162,
        art: `/api/search/shows/${MAINTENANCE_PHASE}/art`,
        status: null,
        item: null,
        following: false,
      },
    ]);
    expect(RequestRef.safeParse(podcasts[0]!.ref).success).toBe(true);
  });

  it('[M3.podcasts] a show iTunes lists without a feed is left out', async () => {
    const { search } = await server();
    const { podcasts } = await search('history');
    expect(podcasts.length).toBeGreaterThan(0);
    expect(podcasts.every(({ ref }) => ref.target.ids.feedUrl !== undefined)).toBe(true);
  });

  it('[M3.podcasts] a show the household holds carries it, and whether the person follows it', async () => {
    const { db, user, search } = await server();
    indexedShow(db, 'show-1', 'Maintenance Phase', {
      feed_url: 'https://RSS.buzzsprout.com/1411126.rss/',
      itunes_id: MAINTENANCE_PHASE,
    });
    const [held] = (await search('maintenance phase')).podcasts;
    expect(held).toMatchObject({
      item: { source: 'abs', id: 'show-1' },
      status: 'inLibrary',
      following: false,
    });
    followShow(db, user.id, { source: 'abs', id: 'show-1' }, T0);
    const [followed] = (await search('maintenance phase')).podcasts;
    expect(followed).toMatchObject({ item: { source: 'abs', id: 'show-1' }, following: true });
  });

  it('[M3.podcasts] a show held by its feed alone is found by its feed', async () => {
    const { db, search } = await server();
    indexedShow(db, 'show-2', 'Maintenance Phase', { feed_url: MAINTENANCE_FEED });
    const [held] = (await search('maintenance phase')).podcasts;
    expect(held?.item).toEqual({ source: 'abs', id: 'show-2' });
  });

  it('[M3.podcasts] a show the person asked for says where the request stands', async () => {
    const { app, headers, search } = await server();
    const [row] = (await search('maintenance phase')).podcasts;
    const asked = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers,
      payload: { ref: row!.ref },
    });
    expect(asked.statusCode).toBeLessThan(300);
    const [after] = (await search('maintenance phase')).podcasts;
    expect(after?.status).not.toBeNull();
  });

  it('[M3.podcasts] a show the person asked for is never listed in Requests, nor leads Search there', async () => {
    const { app, headers, search } = await server();
    const [row] = (await search('maintenance phase')).podcasts;
    const asked = await app.inject({
      method: 'POST',
      url: '/api/requests',
      headers,
      payload: { ref: row!.ref },
    });
    expect(asked.statusCode).toBeLessThan(300);
    expect((asked.json() as { status: string }).status).not.toBe('inLibrary');
    const listed = await app.inject({ method: 'GET', url: '/api/requests', headers });
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(listed.json())).not.toContain('podcast');
    expect((await search('maintenance phase')).hasRequests).toBe(false);
  });

  it('[M3.podcasts] a pasted feed address answers that show alone, once its feed is read', async () => {
    const { search, itunesHosts } = await server();
    const answer = await search(PASTED);
    expect(answer.podcasts).toEqual([
      {
        ref: {
          medium: 'podcast',
          target: {
            title: 'Not What You Thought You Knew',
            creator: null,
            ids: { feedUrl: PASTED },
          },
        },
        title: 'Not What You Thought You Knew',
        host: null,
        episodes: 14,
        art: null,
        status: null,
        item: null,
        following: false,
      },
    ]);
    expect(answer.results).toEqual([]);
    expect(answer.books).toEqual([]);
    expect(itunesHosts).toEqual([]);
  });

  it('[M3.podcasts] a pasted feed address that resolves privately answers no show, and logs no address', async () => {
    const logged: unknown[] = [];
    const connected: string[] = [];
    const never = (() => {
      connected.push('connected');
      throw new Error('never connects');
    }) as never;
    const { search, itunesHosts } = await server({
      logged,
      feed: feedFetch({
        lookup: async () => ['10.0.0.5'],
        requests: { 'http:': never, 'https:': never },
      }),
    });
    const answer = await search('http://feeds.example.com/rss');
    expect(answer.podcasts).toEqual([]);
    expect(connected).toEqual([]);
    expect(itunesHosts).toEqual([]);
    expect(JSON.stringify(logged)).not.toMatch(/feeds\.example\.com|10\.0\.0\.5/);
  });

  it('[M3.podcasts] iTunes being down gives no show rows, never a failed search', async () => {
    const { search } = await server({ itunes: () => Promise.reject(new Error('down')) });
    const answer = await search('maintenance phase');
    expect(answer.podcasts).toEqual([]);
  });

  it('[M3.podcasts] a search of other kinds asks iTunes nothing', async () => {
    const { search, itunesHosts } = await server();
    const answer = await search('maintenance phase', '&kinds=book&kinds=album');
    expect(answer.podcasts).toEqual([]);
    expect(itunesHosts).toEqual([]);
    await search('maintenance phase', '&kinds=show');
    expect(itunesHosts).toEqual(['itunes.apple.com']);
  });

  it("[M3.podcasts] a found show's cover is served from Apple's image host by its iTunes id", async () => {
    const art = counted(
      async () =>
        new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
    );
    const { app, headers, search } = await server({ artFetch: art.fetch });
    const [row] = (await search('maintenance phase')).podcasts;
    const cover = await app.inject({ method: 'GET', url: row!.art!, headers });
    expect(cover.statusCode).toBe(200);
    expect(cover.headers['content-type']).toBe('image/jpeg');
    expect(art.hosts).toEqual(['is1-ssl.mzstatic.com']);
    const unknown = await app.inject({
      method: 'GET',
      url: '/api/search/shows/42/art',
      headers,
    });
    expect(unknown.statusCode).toBe(404);
  });
});

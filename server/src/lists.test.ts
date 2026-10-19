/**
 * The lists routes and the digest rule, through the real routes, on an index of the two recorded
 * shows (episodes dated and ordered by their recorded feeds) and the recorded four-file book.
 * Each person's own Audiobookshelf `GET /api/me` says which libraries they may open and what they
 * finished: kara's is `me-finished` (show 1's Part One finished) unless a test hands her another,
 * and otto's is the recorded `me` granted no library. The clock is injected, so "new" is measured
 * from a time inside the recorded episodes' dates.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListDetail, type ListItem, type MediaRef, ListSummaryList } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { itemSummarySchema, type ShowSummary } from './adapters/audiobookshelf/schemas.js';
import { parseFeed } from './adapters/feed/client.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { buildApp } from './app.js';
import { absTree, orderingFromFeed } from './libraryIndex/rows.js';
import { applyTree, emptyCounts } from './libraryIndex/store.js';
import { DIGEST_NEW_DAYS } from './lists/rules.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { markPlayed } from './store/lists.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const abs = (call: string) => recording('audiobookshelf', call);
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;
const feed = (call: string) =>
  parseFeed((recording('feed', call).response.body as { text: string }).text);

interface AbsMe {
  permissions: { accessAllLibraries: boolean };
  librariesAccessible: string[];
  mediaProgress: {
    id?: string;
    libraryItemId: string;
    episodeId?: string | null;
    progress: number;
    isFinished: boolean;
    lastUpdate?: number;
  }[];
}

const book = itemSummarySchema.parse(json(abs('multi-detail')));
const shows = (['index-show-1', 'index-show-2'] as const)
  .map((c) => itemSummarySchema.parse(json(abs(c))))
  .filter((item): item is ShowSummary => item.mediaType === 'podcast');
const feeds = [feed('show-1-feed'), feed('show-2-feed')];
const orderings = shows.map((show, i) => orderingFromFeed(show, feeds[i]!));

const ref = (id: string): MediaRef => ({ source: 'abs', id });
const bookRef = ref(book.id);
const show1 = ref(shows[0]!.id);
const show2 = ref(shows[1]!.id);
/** Show 1's episodes by title, as the recorded show names them. */
const part = (name: string) => {
  const e = shows[0]!.media.episodes.find((ep) => ep.title.includes(`, Part ${name}:`))!;
  return ref(e.id);
};
const [one, two, three, four] = ['One', 'Two', 'Three', 'Four'].map(part) as [
  MediaRef,
  MediaRef,
  MediaRef,
  MediaRef,
];
/** When the feed says each episode of either show came out, by id. */
const published = new Map(orderings.flatMap((o) => [...o.publishedAt]));
const at = (e: MediaRef) => published.get(e.id)!;

const DAY = 24 * 60 * 60 * 1000;
/** A week after show 1's last episode: its four came out on 5 to 8 September 2023. */
const SEPT_15 = Date.UTC(2023, 8, 15);
/** Inside show 2's run of December 2021. */
const DEC_20 = Date.UTC(2021, 11, 20);

const meFinished = abs('me-finished');
const finishedEpisode = json<AbsMe>(meFinished).mediaProgress[0]!;

/** kara's `GET /api/me`: `me-finished`, its one progress row replaced by `rows`. */
function karaMe(rows: Partial<AbsMe['mediaProgress'][number]>[]): Recording {
  const copy = structuredClone(meFinished);
  json<AbsMe>(copy).mediaProgress = rows.map((row) => ({ ...finishedEpisode, ...row }));
  return copy;
}
/** otto's `GET /api/me`: the recorded one, granted no library. */
const ottoMe = structuredClone(abs('me'));
Object.assign(json<AbsMe>(ottoMe), {
  permissions: { ...json<AbsMe>(ottoMe).permissions, accessAllLibraries: false },
  librariesAccessible: [],
  mediaProgress: [],
});

const KEY = Buffer.alloc(32, 7);
const UPSTREAM = 'http://upstream.invalid';

function index(db: Db): void {
  const counts = emptyCounts();
  applyTree(db, absTree(book), 1, counts);
  shows.forEach((show, i) => applyTree(db, absTree(show, orderings[i]), 1, counts));
}

let apps: FastifyInstance[] = [];
let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  index(db);
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

interface Answer {
  status: number;
  body: unknown;
}

/** kara, granted every library, and otto, granted none; the clock starts at `now`. */
async function server(options: { now?: number; me?: Recording } = {}) {
  const clock = { now: options.now ?? SEPT_15 };
  const kara = replayFetch([options.me ?? meFinished]);
  const otto = replayFetch([ottoMe]);
  const fetch: FetchLike = async (url, init) => {
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    return (authorization.includes('otto') ? otto : kara)(url, init);
  };
  const bearer: Record<string, string> = {};
  const users: Record<string, string> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    users[name] = user.id;
    saveLink(db, KEY, {
      userId: user.id,
      service: 'abs',
      upstreamUserId: `abs-${name}`,
      token: `abs-token-${name}`,
      state: 'linked',
    });
    const device = createDevice(db, { userId: user.id, kind: 'web' });
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
  const app = await buildApp({
    webDistDir: null,
    db,
    now: () => clock.now,
    upstreams: { key: KEY, config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM }, fetch },
  });
  apps.push(app);
  const call = async (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    body?: unknown,
    name = 'kara',
  ): Promise<Answer> => {
    const res = await app.inject({
      method,
      url: `/api${url}`,
      headers: { authorization: `Bearer ${bearer[name] ?? ''}` },
      ...(body === undefined ? {} : { payload: body as object }),
    });
    return { status: res.statusCode, body: res.json<unknown>() };
  };
  const ok = <T>(answer: Answer, schema: { parse(v: unknown): T }): T => {
    expect(answer, JSON.stringify(answer.body)).toMatchObject({ status: 200 });
    return schema.parse(answer.body);
  };
  const lists = async (name = 'kara') =>
    ok(await call('GET', '/lists', undefined, name), ListSummaryList).lists;
  const theDigest = async (name = 'kara') => (await lists(name))[0]!;
  const detail = async (id: string, name = 'kara') =>
    ok(await call('GET', `/lists/${id}`, undefined, name), ListDetail);
  const create = async (body: object, name = 'kara') =>
    ok(await call('POST', '/lists', body, name), ListDetail);
  const refs = (items: ListItem[]) => items.map((i) => i.ref);
  return { clock, users, call, ok, lists, theDigest, detail, create, refs };
}

const refused = (status: number, error: string) => ({ status, body: { error } });

describe('[M2.lists/b] The Digest: subscribed shows’ unplayed episodes of the last 14 days', () => {
  it('[M2.lists/b] holds every show’s new unplayed episodes oldest first, leaving out the finished one and older ones', async () => {
    const s = await server();

    const [digest, ...rest] = await s.lists();
    const opened = await s.detail(digest!.id);

    expect(rest).toEqual([]);
    expect(digest).toMatchObject({ kind: 'digest', name: 'The Digest', theDigest: true });
    expect(digest!.order).toBe('oldest');
    // Part One came out on 5 September too, but kara finished it; show 2's newest are from June
    // 2023, older than 14 days, and from 2025, not yet out.
    expect(s.refs(opened.items)).toEqual([two, three, four]);
    expect(digest!.count).toBe(3);
    expect(opened.items.map((i) => i.publishedAt)).toEqual([at(two), at(three), at(four)]);
    expect(opened.items[0]).toMatchObject({
      kind: 'episode',
      sub: shows[0]!.media.metadata.title,
      art: `/api/media/abs:${show1.id}/art`,
      finished: false,
    });
    expect(opened.shows.map((e) => e.ref)).toEqual(
      [shows[0]!, shows[1]!]
        .sort((a, b) => a.media.metadata.title.localeCompare(b.media.metadata.title))
        .map((show) => ref(show.id)),
    );
    expect(opened.items.some((i) => i.ref.id === finishedEpisode.episodeId)).toBe(false);
  });

  it('[M2.lists/b] drops an episode once it is older than 14 days, to the moment', async () => {
    const s = await server({ now: at(three) + DIGEST_NEW_DAYS * DAY });
    const digest = await s.theDigest();

    expect(DIGEST_NEW_DAYS).toBe(14);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([four]);
    s.clock.now -= 1;
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three, four]);
  });

  it('[M2.lists/b] leaves out an episode finished on Audiobookshelf and keeps one in progress', async () => {
    const me = karaMe([
      { episodeId: three.id, isFinished: true, progress: 1 },
      { id: 'in-progress', episodeId: two.id, isFinished: false, progress: 0.4 },
    ]);
    const s = await server({ me });

    const opened = await s.detail((await s.theDigest()).id);

    expect(s.refs(opened.items)).toEqual([one, two, four]);
    expect(opened.items[1]).toMatchObject({ progress: 0.4, finished: false });
  });

  it('[M2.lists/b] leaves out an episode Auralis marked played, unless Audiobookshelf changed it since', async () => {
    const lastUpdate = finishedEpisode.lastUpdate!;
    const me = karaMe([{ episodeId: three.id, isFinished: false, progress: 0.3, lastUpdate }]);
    const s = await server({ me });
    markPlayed(db, s.users.kara!, four, 1);
    markPlayed(db, s.users.kara!, three, lastUpdate - 1);

    const opened = await s.detail((await s.theDigest()).id);

    expect(s.refs(opened.items)).toEqual([one, two, three]);
    markPlayed(db, s.users.kara!, three, lastUpdate + 1);
    expect(s.refs((await s.detail(opened.id)).items)).toEqual([one, two]);
  });

  it('[M2.lists/b] holds no show of a library the person may not open', async () => {
    const s = await server();

    const opened = await s.detail((await s.theDigest('otto')).id, 'otto');

    expect(opened.shows).toEqual([]);
    expect(opened.items).toEqual([]);
  });

  it('[M2.lists/b] plays newest first once turned round, and keeps that', async () => {
    const s = await server();
    const digest = await s.theDigest();

    const turned = s.ok(
      await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest' }),
      ListDetail,
    );

    expect(turned.order).toBe('newest');
    expect(s.refs(turned.items)).toEqual([four, three, two]);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([four, three, two]);
  });
});

describe('[M2.lists/c] a custom digest over the shows you choose', () => {
  it('[M2.lists/c] holds only its shows’ new unplayed episodes, in its order, and follows a change of shows', async () => {
    const s = await server({ now: DEC_20 });
    const show2Episodes = shows[1]!.media
      .episodes!.map((e) => ref(e.id))
      .filter((e) => at(e) > DEC_20 - 14 * DAY && at(e) <= DEC_20)
      .sort((a, b) => at(a) - at(b));

    const made = await s.create({ kind: 'digest', name: 'Work', shows: [show2] });

    expect(made).toMatchObject({ kind: 'digest', name: 'Work', theDigest: false, order: 'oldest' });
    expect(made.shows.map((e) => e.ref)).toEqual([show2]);
    expect(show2Episodes).toHaveLength(2);
    expect(s.refs(made.items)).toEqual(show2Episodes);

    s.clock.now = SEPT_15;
    expect((await s.detail(made.id)).items).toEqual([]);
    const changed = s.ok(
      await s.call('PATCH', `/lists/${made.id}`, { shows: [show1] }),
      ListDetail,
    );
    expect(changed.shows.map((e) => e.ref)).toEqual([show1]);
    expect(s.refs(changed.items)).toEqual([two, three, four]);
    expect((await s.lists()).map((l) => [l.name, l.count])).toEqual([
      ['The Digest', 3],
      ['Work', 3],
    ]);
  });
});

describe('the lists routes', () => {
  it('makes, renames, fills, reorders and deletes a playlist', async () => {
    const s = await server();

    const made = await s.create({ kind: 'playlist', name: 'Drive' });
    expect(made).toMatchObject({ kind: 'playlist', theDigest: false, order: null, count: 0 });
    expect((await s.lists()).map((l) => l.name)).toEqual(['The Digest', 'Drive']);

    s.ok(await s.call('PATCH', `/lists/${made.id}`, { name: 'Commute' }), ListDetail);
    s.ok(await s.call('POST', `/lists/${made.id}/items`, { ref: two }), ListDetail);
    const filled = s.ok(await s.call('POST', `/lists/${made.id}/items`, { ref: four }), ListDetail);
    expect(s.refs(filled.items)).toEqual([two, four]);
    const turned = s.ok(
      await s.call('PUT', `/lists/${made.id}/items`, { refs: [four, two] }),
      ListDetail,
    );
    expect(turned).toMatchObject({ name: 'Commute', count: 2 });
    expect(s.refs(turned.items)).toEqual([four, two]);
    expect(turned.shows).toEqual([]);

    expect(await s.call('DELETE', `/lists/${made.id}`)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await s.call('GET', `/lists/${made.id}`)).toEqual(refused(404, 'not_found'));
    expect((await s.lists()).map((l) => l.name)).toEqual(['The Digest']);
  });

  it('keeps an entry or show named twice once, where first named', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Drive' });

    const put = s.ok(
      await s.call('PUT', `/lists/${list.id}/items`, { refs: [two, four, two] }),
      ListDetail,
    );
    const again = s.ok(await s.call('POST', `/lists/${list.id}/items`, { ref: two }), ListDetail);
    const digest = await s.create({ kind: 'digest', name: 'Work', shows: [show1, show1] });

    expect(s.refs(put.items)).toEqual([two, four]);
    expect(s.refs(again.items)).toEqual([two, four]);
    expect(digest.shows.map((e) => e.ref)).toEqual([show1]);
  });

  it('refuses The Digest a name, shows, entries or deletion, changing nothing, but turns its order', async () => {
    const s = await server();
    const digest = await s.theDigest();
    const fixed = refused(400, 'fixed_list');

    expect(await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest', name: 'Mine' })).toEqual(
      fixed,
    );
    expect(
      await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest', shows: [show1] }),
    ).toEqual(fixed);
    expect(await s.call('POST', `/lists/${digest.id}/items`, { ref: show1 })).toEqual(fixed);
    expect(await s.call('PUT', `/lists/${digest.id}/items`, { refs: [] })).toEqual(fixed);
    expect(await s.call('DELETE', `/lists/${digest.id}`)).toEqual(fixed);

    expect(await s.theDigest()).toEqual(digest);
    expect(
      s.ok(await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest' }), ListDetail).order,
    ).toBe('newest');
  });

  it('refuses an entry a list does not take, and an order or shows off a digest, changing nothing', async () => {
    const s = await server();
    const wrong = refused(400, 'wrong_kind');
    const playlist = await s.create({ kind: 'playlist', name: 'Drive' });
    const listening = await s.create({ kind: 'listening', name: 'Books' });
    const digest = await s.create({ kind: 'digest', name: 'Work', shows: [show1] });

    expect(await s.call('POST', `/lists/${playlist.id}/items`, { ref: show1 })).toEqual(wrong);
    expect(await s.call('POST', `/lists/${playlist.id}/items`, { ref: bookRef })).toEqual(wrong);
    expect(await s.call('PUT', `/lists/${listening.id}/items`, { refs: [bookRef, two] })).toEqual(
      wrong,
    );
    expect(await s.call('POST', '/lists', { kind: 'digest', name: 'X', shows: [two] })).toEqual(
      wrong,
    );
    expect(
      await s.call('POST', '/lists', { kind: 'playlist', name: 'X', order: 'newest' }),
    ).toEqual(wrong);
    expect(await s.call('POST', '/lists', { kind: 'listening', name: 'X', shows: [] })).toEqual(
      wrong,
    );
    expect(await s.call('PATCH', `/lists/${playlist.id}`, { name: 'Y', order: 'newest' })).toEqual(
      wrong,
    );
    expect(await s.call('PATCH', `/lists/${digest.id}`, { name: 'Y', shows: [bookRef] })).toEqual(
      wrong,
    );
    expect(await s.call('POST', `/lists/${digest.id}/items`, { ref: show2 })).toEqual(wrong);

    expect((await s.lists()).map((l) => l.name)).toEqual(['The Digest', 'Drive', 'Books', 'Work']);
    expect((await s.detail(listening.id)).items).toEqual([]);
    expect((await s.detail(digest.id)).shows.map((e) => e.ref)).toEqual([show1]);
  });

  it('refuses an empty name, and an entry not indexed or in a library the person may not open', async () => {
    const s = await server();
    const mine = await s.create({ kind: 'playlist', name: 'Drive' });
    const ottos = await s.create({ kind: 'playlist', name: 'Drive' }, 'otto');

    expect(await s.call('POST', '/lists', { kind: 'playlist', name: ' ' })).toEqual(
      refused(400, 'bad_request'),
    );
    expect(await s.call('POST', `/lists/${mine.id}/items`, { ref: ref('not-indexed') })).toEqual(
      refused(404, 'not_found'),
    );
    expect(await s.call('POST', `/lists/${ottos.id}/items`, { ref: two }, 'otto')).toEqual(
      refused(404, 'not_found'),
    );
    expect(
      await s.call('POST', '/lists', { kind: 'digest', name: 'X', shows: [show1] }, 'otto'),
    ).toEqual(refused(404, 'not_found'));
  });

  it('answers 404 to every call on another person’s list', async () => {
    const s = await server();
    const mine = await s.create({ kind: 'playlist', name: 'Drive' });
    const missing = refused(404, 'not_found');

    expect(await s.call('GET', `/lists/${mine.id}`, undefined, 'otto')).toEqual(missing);
    expect(await s.call('PATCH', `/lists/${mine.id}`, { name: 'Ha' }, 'otto')).toEqual(missing);
    expect(await s.call('POST', `/lists/${mine.id}/items`, { ref: two }, 'otto')).toEqual(missing);
    expect(await s.call('PUT', `/lists/${mine.id}/items`, { refs: [] }, 'otto')).toEqual(missing);
    expect(await s.call('DELETE', `/lists/${mine.id}`, undefined, 'otto')).toEqual(missing);
    expect((await s.detail(mine.id)).name).toBe('Drive');
  });

  it('leaves a played episode out of a playlist without taking it off', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Drive' });
    s.ok(await s.call('PUT', `/lists/${list.id}/items`, { refs: [one, two] }), ListDetail);

    const opened = await s.detail(list.id);
    markPlayed(db, s.users.kara!, two, 1);

    expect(s.refs(opened.items)).toEqual([two]);
    expect((await s.detail(list.id)).items).toEqual([]);
    const added = s.ok(await s.call('POST', `/lists/${list.id}/items`, { ref: three }), ListDetail);
    expect(s.refs(added.items)).toEqual([three]);
  });

  it('crosses a finished book off a listening list, keeping it', async () => {
    const me = karaMe([{ libraryItemId: book.id, episodeId: null, isFinished: true, progress: 1 }]);
    const s = await server({ me });
    const list = await s.create({ kind: 'listening', name: 'Books' });

    const filled = s.ok(
      await s.call('PUT', `/lists/${list.id}/items`, { refs: [bookRef, show1] }),
      ListDetail,
    );

    expect(filled.items.map((i) => [i.ref, i.kind, i.finished])).toEqual([
      [bookRef, 'book', true],
      [show1, 'show', false],
    ]);
    expect(filled.items[0]).toMatchObject({ title: book.media.metadata.title, progress: 1 });
    expect(filled.items[1]).toMatchObject({ publishedAt: null, duration: null, progress: null });
  });

  it('crosses off a show on a listening list once every episode of it is finished', async () => {
    const me = karaMe(
      [one, two, three, four].map((e, i) => ({ id: `p${i}`, episodeId: e.id, isFinished: true })),
    );
    const s = await server({ me });
    const list = await s.create({ kind: 'listening', name: 'Shows' });

    const filled = s.ok(
      await s.call('POST', `/lists/${list.id}/items`, { ref: show1 }),
      ListDetail,
    );

    expect(filled.items.map((i) => i.finished)).toEqual([true]);
  });
});

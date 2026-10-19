/**
 * Test-only: the lists routes through the real server, on an index of the two recorded shows
 * (episodes dated and ordered by their recorded feeds) and the recorded four-file book. Each
 * person's own Audiobookshelf `GET /api/me` says which libraries they may open and what they
 * finished: kara's is `me-finished` (show 1's Part One finished) unless a test hands her another,
 * and otto's is the recorded `me` granted no library. The clock is injected, so "new" is measured
 * from a time inside the recorded episodes' dates. Show 1's Part Two plays (`episode-play`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListDetail, type ListItem, type MediaRef, ListSummaryList } from '@auralis/schema';
import { expect } from 'vitest';
import { itemSummarySchema, type ShowSummary } from '../audiobookshelf/schemas.js';
import { parseFeed } from '../feed/client.js';
import { type FetchLike } from './fetch.js';
import { type Recording, recordingSchema } from './recording.js';
import { replayFetch } from './replay.js';
import { buildApp } from '../../app.js';
import { absTree, orderingFromFeed } from '../../libraryIndex/rows.js';
import { applyTree, emptyCounts } from '../../libraryIndex/store.js';
import { type Db } from '../../store/connection.js';
import { createDevice } from '../../store/devices.js';
import { createSession } from '../../store/sessions.js';
import { saveLink } from '../../store/upstreamLinks.js';
import { upsertUser } from '../../store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..');
const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const abs = (call: string) => recording('audiobookshelf', call);
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;
const feed = (call: string) =>
  parseFeed((recording('feed', call).response.body as { text: string }).text);

export interface AbsMe {
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

export const book = itemSummarySchema.parse(json(abs('multi-detail')));
/** The book's chapters, in seconds from its start, as its recorded detail answers them. */
export const bookChapters = json<{ media: { chapters: { start: number; end: number }[] } }>(
  abs('multi-detail'),
).media.chapters;
export const shows = (['index-show-1', 'index-show-2'] as const)
  .map((c) => itemSummarySchema.parse(json(abs(c))))
  .filter((item): item is ShowSummary => item.mediaType === 'podcast');
const feeds = [feed('show-1-feed'), feed('show-2-feed')];
const orderings = shows.map((show, i) => orderingFromFeed(show, feeds[i]!));

export const ref = (id: string): MediaRef => ({ source: 'abs', id });
export const bookRef = ref(book.id);
export const show1 = ref(shows[0]!.id);
export const show2 = ref(shows[1]!.id);
/** Show 1's episodes by title, as the recorded show names them. */
const part = (name: string) => {
  const e = shows[0]!.media.episodes.find((ep) => ep.title.includes(`, Part ${name}:`))!;
  return ref(e.id);
};
export const [one, two, three, four] = ['One', 'Two', 'Three', 'Four'].map(part) as [
  MediaRef,
  MediaRef,
  MediaRef,
  MediaRef,
];
/** When the feed says each episode of either show came out, by id. */
export const published = new Map(orderings.flatMap((o) => [...o.publishedAt]));
export const at = (e: MediaRef) => published.get(e.id)!;

export const DAY = 24 * 60 * 60 * 1000;
/** A week after show 1's last episode: its four came out on 5 to 8 September 2023. */
export const SEPT_15 = Date.UTC(2023, 8, 15);
/** Inside show 2's run of December 2021. */
export const DEC_20 = Date.UTC(2021, 11, 20);

export const meFinished = abs('me-finished');
export const finishedEpisode = json<AbsMe>(meFinished).mediaProgress[0]!;

/** kara's `GET /api/me`: `me-finished`, its one progress row replaced by `rows`. */
export function karaMe(rows: Partial<AbsMe['mediaProgress'][number]>[]): Recording {
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

/** kara's `me-finished`, granted only the libraries named. */
export function grantedOnly(libraries: string[]): Recording {
  const copy = structuredClone(meFinished);
  Object.assign(json<AbsMe>(copy), {
    permissions: { ...json<AbsMe>(copy).permissions, accessAllLibraries: false },
    librariesAccessible: libraries,
  });
  return copy;
}
export const booksLibrary = book.libraryId;

/** The book's chapters and a listen to it, and show 1's Part Two played. */
const PLAYS = ['multi-detail', 'progress-play', 'progress-read', 'episode-play'].map(abs);

const KEY = Buffer.alloc(32, 7);
const UPSTREAM = 'http://upstream.invalid';

export function index(db: Db): void {
  const counts = emptyCounts();
  applyTree(db, absTree(book), 1, counts);
  shows.forEach((show, i) => applyTree(db, absTree(show, orderings[i]), 1, counts));
}

export interface Answer {
  status: number;
  body: unknown;
}

/**
 * kara, granted every library, on two devices (`kara` and `kara-phone`), and otto, granted none;
 * the clock starts at `now`.
 */
export async function listsServer(db: Db, options: { now?: number; me?: Recording } = {}) {
  const clock = { now: options.now ?? SEPT_15 };
  let kara = replayFetch([options.me ?? meFinished, ...PLAYS]);
  /** Hands kara another `GET /api/me` from the next call on. */
  const karaAnswers = (me: Recording) => {
    kara = replayFetch([me, ...PLAYS]);
  };
  const otto = replayFetch([ottoMe]);
  /** Every upstream call made, as `METHOD path?query`. */
  const sent: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const { pathname, search } = new URL(url);
    sent.push(`${init?.method ?? 'GET'} ${pathname}${search}`);
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    return (authorization.includes('otto') ? otto : kara)(url, init);
  };
  const bearer: Record<string, string> = {};
  const users: Record<string, string> = {};
  const devices: Record<string, string> = {};
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
    devices[name] = device.id;
    bearer[name] = createSession(db, {
      userId: user.id,
      deviceId: device.id,
      kind: 'bearer',
    }).token;
  }
  // kara's second device, called as `kara-phone`.
  const phone = createDevice(db, { userId: users.kara!, kind: 'web' });
  devices['kara-phone'] = phone.id;
  bearer['kara-phone'] = createSession(db, {
    userId: users.kara!,
    deviceId: phone.id,
    kind: 'bearer',
  }).token;
  const app = await buildApp({
    webDistDir: null,
    db,
    now: () => clock.now,
    upstreams: { key: KEY, config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM }, fetch },
  });
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
  return {
    app,
    clock,
    sent,
    users,
    devices,
    karaAnswers,
    call,
    ok,
    lists,
    theDigest,
    detail,
    create,
    refs,
  };
}

export const refused = (status: number, error: string) => ({ status, body: { error } });

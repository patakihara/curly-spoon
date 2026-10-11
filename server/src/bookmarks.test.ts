/**
 * Bookmarks through the real routes, kept on Audiobookshelf as the person. Audiobookshelf answers
 * from the recordings of one bookmark made on the four-file book, listed on `GET /api/me`, deleted,
 * and deleted again once it was gone. Replay matches a call by method and path, so each test reads
 * the calls the server sent to see what it asked.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { buildApp } from './app.js';
import { openDatabase } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const recording = (call: string) =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(join(adapters, 'audiobookshelf', 'recordings', `${call}.json`), 'utf8'),
    ),
  );
const [created, me, deleted, missing] = [
  'bookmark-create',
  'me',
  'bookmark-delete',
  'bookmark-delete-missing',
].map(recording) as [Recording, Recording, Recording, Recording];
const made = (created.response.body as { json: { libraryItemId: string; createdAt: number } }).json;
const bookId = made.libraryItemId;
const ref = { source: 'abs', id: bookId } as const;
const JELLYFIN_TRACK = '0123456789abcdef0123456789abcdef';

interface MeJson {
  bookmarks: { libraryItemId: string; time: number; title: string; createdAt: number }[];
}
/** The recorded `GET /api/me` with its bookmarks changed by `edit`: the only change, named by each test. */
function meWith(edit: (json: MeJson) => void): Recording {
  const copy = structuredClone(me);
  edit((copy.response.body as { json: MeJson }).json);
  return copy;
}

const KEY = Buffer.alloc(32, 7);

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

interface Sent {
  method: string;
  path: string;
  authorization: string;
  json: unknown;
}

/** kara, linked to Audiobookshelf and Jellyfin with tokens of her own, and otto, linked to neither. */
async function server(recordings: Recording[] = [created, me, deleted]) {
  const db = openDatabase(':memory:');
  const sent: Sent[] = [];
  const replay = replayFetch(recordings);
  const fetch: FetchLike = async (url, init) => {
    sent.push({
      method: init?.method ?? 'GET',
      path: new URL(url).pathname,
      authorization: new Headers(init?.headers).get('authorization') ?? '',
      json: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    });
    return replay(url, init);
  };
  const bearer: Record<string, string> = {};
  for (const name of ['kara', 'otto']) {
    const user = upsertUser(db, { username: name, role: 'member' });
    if (name === 'kara') {
      for (const service of ['abs', 'jellyfin'] as const) {
        saveLink(db, KEY, {
          userId: user.id,
          service,
          upstreamUserId: `${service}-${name}`,
          token: `${service}-token-${name}`,
          state: 'linked',
        });
      }
    }
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
    upstreams: {
      key: KEY,
      config: { absUrl: PLACEHOLDER_ORIGIN, jellyfinUrl: 'http://jellyfin.upstream.invalid' },
      fetch,
    },
  });
  apps.push(app);
  const as = (name: string) => ({ authorization: `Bearer ${bearer[name] ?? ''}` });
  const create = (payload: object, name = 'kara') =>
    app.inject({ method: 'POST', url: '/api/bookmarks', headers: as(name), payload });
  const list = (key: string, name = 'kara') =>
    app.inject({
      method: 'GET',
      url: `/api/bookmarks?ref=${encodeURIComponent(key)}`,
      headers: as(name),
    });
  const remove = (key: string, time: string, name = 'kara') =>
    app.inject({
      method: 'DELETE',
      url: `/api/bookmarks/${encodeURIComponent(key)}/${time}`,
      headers: as(name),
    });
  return { app, sent, create, list, remove };
}

describe('[M1.progress/b] bookmarks on Audiobookshelf', () => {
  it("[M1.progress/b] creates, lists and deletes a bookmark, each through Audiobookshelf's own call, as the person", async () => {
    const { sent, create, list, remove } = await server();

    const made_ = await create({ ref, time: 30, title: 'Auralis test' });
    expect(made_.statusCode, made_.body).toBe(200);
    expect(made_.json()).toEqual({
      ref,
      time: 30,
      title: 'Auralis test',
      createdAt: made.createdAt,
    });

    const listed = await list(`abs:${bookId}`);
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json()).toEqual({
      bookmarks: [{ ref, time: 30, title: 'Auralis test', createdAt: made.createdAt }],
    });

    const gone = await remove(`abs:${bookId}`, '30');
    expect(gone.statusCode, gone.body).toBe(200);
    expect(gone.json()).toEqual({ ok: true });

    expect(sent).toEqual([
      {
        method: 'POST',
        path: created.request.path,
        authorization: 'Bearer abs-token-kara',
        json: { time: 30, title: 'Auralis test' },
      },
      {
        method: 'GET',
        path: me.request.path,
        authorization: 'Bearer abs-token-kara',
        json: undefined,
      },
      {
        method: 'DELETE',
        path: deleted.request.path,
        authorization: 'Bearer abs-token-kara',
        json: undefined,
      },
    ]);
  });
});

describe('bookmarks', () => {
  it("lists only the item's own bookmarks, in the order they sit in it", async () => {
    const other = { libraryItemId: 'another-book', time: 5, title: 'Elsewhere', createdAt: 1 };
    const { list } = await server([
      meWith((json) => {
        const [mine] = json.bookmarks;
        json.bookmarks = [{ ...mine!, time: 90, title: 'Later' }, other, mine!];
      }),
    ]);
    const res = await list(`abs:${bookId}`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<{ bookmarks: { time: number }[] }>().bookmarks.map((b) => b.time)).toEqual([
      30, 90,
    ]);
  });

  it('lists none for an item with no bookmarks', async () => {
    const { list } = await server([meWith((json) => (json.bookmarks = []))]);
    expect((await list(`abs:${bookId}`)).json()).toEqual({ bookmarks: [] });
  });

  it('keeps the title made, trimmed of the spaces around it', async () => {
    const { sent, create } = await server();
    await create({ ref, time: 30, title: '  Auralis test  ' });
    expect(sent.at(-1)?.json).toEqual({ time: 30, title: 'Auralis test' });
  });

  it('answers 404 to deleting a bookmark that is not there, as Audiobookshelf does', async () => {
    const { remove } = await server([missing]);
    const res = await remove(`abs:${bookId}`, '30');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('refuses a Jellyfin item with 400, asking nothing: Jellyfin keeps no bookmarks', async () => {
    const { sent, create, list, remove } = await server();
    const track = { source: 'jellyfin', id: JELLYFIN_TRACK };
    for (const res of [
      await create({ ref: track, time: 30, title: 'A riff' }),
      await list(`jellyfin:${JELLYFIN_TRACK}`),
      await remove(`jellyfin:${JELLYFIN_TRACK}`, '30'),
    ]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'no_bookmarks' });
    }
    expect(sent).toEqual([]);
  });

  it('refuses a malformed bookmark with 400, asking nothing', async () => {
    const { sent, create, list, remove } = await server();
    for (const payload of [
      { ref, time: 30.5, title: 'Half' },
      { ref, time: -1, title: 'Before' },
      { ref, time: 30, title: '   ' },
      { ref, time: 30, title: 'x'.repeat(201) },
      { ref: { source: 'abs', id: '../users' }, time: 30, title: 'Path' },
      { time: 30, title: 'No item' },
    ]) {
      expect((await create(payload)).statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect((await list('abs:../users')).statusCode).toBe(400);
    expect((await list('')).statusCode).toBe(400);
    for (const time of ['-1', '1e3', 'x', '01']) {
      expect((await remove(`abs:${bookId}`, time)).statusCode, time).toBe(400);
    }
    expect(sent).toEqual([]);
  });

  it('deletes a bookmark another client made between whole seconds, at the time it was listed', async () => {
    const { sent, remove } = await server([
      { ...deleted, request: { ...deleted.request, path: `/api/me/item/${bookId}/bookmark/12.5` } },
    ]);
    expect((await remove(`abs:${bookId}`, '12.5')).statusCode).toBe(200);
    expect(sent.at(-1)?.path).toBe(`/api/me/item/${bookId}/bookmark/12.5`);
  });

  it('answers 409 to someone with no Audiobookshelf link, asking nothing', async () => {
    const { sent, create, list } = await server();
    expect((await create({ ref, time: 30, title: 'Mine' }, 'otto')).statusCode).toBe(409);
    expect((await list(`abs:${bookId}`, 'otto')).json()).toEqual({ error: 'not_linked' });
    expect(sent).toEqual([]);
  });

  it('refuses a request without a session', async () => {
    const { app, sent } = await server();
    const res = await app.inject({ method: 'GET', url: `/api/bookmarks?ref=abs:${bookId}` });
    expect(res.statusCode).toBe(401);
    expect(sent).toEqual([]);
  });
});

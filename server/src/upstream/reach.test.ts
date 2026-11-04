/**
 * Whether a person's own account reaches a row, on the permissions Audiobookshelf recorded: the
 * listen-only service account (`me.json`) and a real restricted account's (`users-list.json`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { type FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { type StoredRow } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import { keepHeld } from '../store/heldProgress.js';
import { saveLink } from '../store/upstreamLinks.js';
import { upsertUser, type User } from '../store/users.js';
import { Reach, withHeld } from './reach.js';

const recording = (upstream: string, call: string) =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(
        join(
          dirname(fileURLToPath(import.meta.url)),
          '..',
          'adapters',
          upstream,
          'recordings',
          `${call}.json`,
        ),
        'utf8',
      ),
    ),
  );
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;
interface Account {
  id: string;
  permissions: { accessAllLibraries: boolean };
  librariesAccessible: string[];
}
const accounts = json<{ users: Account[] }>(recording('audiobookshelf', 'users-list')).users;
const restricted = accounts.find((u) => u.id === 'user-3')!;
const granted = restricted.librariesAccessible[0]!;

/** The recorded `GET /api/me` with a recorded account's permissions. The only change. */
function meOf(account: Account): Recording {
  const me = structuredClone(recording('audiobookshelf', 'me'));
  Object.assign(json<object>(me), {
    permissions: account.permissions,
    librariesAccessible: account.librariesAccessible,
  });
  return me;
}

const KEY = Buffer.alloc(32, 7);
const UPSTREAM = 'http://upstream.invalid';
const rowIn = (libraryId: string, source: 'abs' | 'jellyfin' = 'abs') =>
  ({ source, id: 'row', parentId: null, libraryId }) as StoredRow;

let db: Db;
let user: User;
beforeEach(() => {
  db = openDatabase(':memory:');
  user = upsertUser(db, { username: 'kara', role: 'member' });
});
afterEach(() => db.close());

function link(service: 'abs' | 'jellyfin') {
  saveLink(db, KEY, {
    userId: user.id,
    service,
    upstreamUserId: `${service}-kara`,
    token: `${service}-token`,
    state: 'linked',
  });
}

function reachWith(fetch: FetchLike, household = true) {
  const clients = household
    ? {
        household: {
          abs: new AbsClient({ baseUrl: UPSTREAM, token: 'household', fetch }),
          jellyfin: new JellyfinClient({ baseUrl: UPSTREAM, token: 'household', fetch }),
        },
      }
    : {};
  return new Reach(db, {
    key: KEY,
    config: { absUrl: UPSTREAM, jellyfinUrl: UPSTREAM },
    fetch,
    ...clients,
  });
}

describe('[M3.requests/d] whether a person’s own account reaches a row', () => {
  it('[M3.requests/d] an account granted every library reaches any row', async () => {
    link('abs');
    const reach = reachWith(replayFetch([recording('audiobookshelf', 'me')]));
    expect(await reach.reaches(user, rowIn('any-library'))).toBe(true);
    expect((await reach.pick(user, 'abs', rowIn('any-library')))?.household).toBe(false);
  });

  it('[M3.requests/d] a restricted account reaches only its own libraries', async () => {
    link('abs');
    const reach = reachWith(replayFetch([meOf(restricted)]));
    expect(await reach.reaches(user, rowIn(granted))).toBe(true);
    expect(await reach.reaches(user, rowIn('another-library'))).toBe(false);
    expect((await reach.pick(user, 'abs', rowIn(granted)))?.household).toBe(false);
    expect((await reach.pick(user, 'abs', rowIn('another-library')))?.household).toBe(true);
  });

  it('[M3.requests/d] no link reaches nothing, and Auralis’s own account acts', async () => {
    const reach = reachWith(replayFetch([]));
    expect(await reach.reaches(user, rowIn(granted))).toBe(false);
    expect((await reach.pick(user, 'jellyfin', rowIn(granted, 'jellyfin')))?.household).toBe(true);
  });

  it('[M3.requests/d] with no key for Auralis’s own account, nobody acts past their reach', async () => {
    link('abs');
    const reach = reachWith(replayFetch([meOf(restricted)]), false);
    expect(await reach.pick(user, 'abs', rowIn('another-library'))).toBeNull();
  });

  it('[M3.requests/d] a token its upstream refuses reaches nothing; any other failure stays one', async () => {
    link('abs');
    const refuses = reachWith(async () => new Response('', { status: 401 }));
    expect(await refuses.reaches(user, rowIn(granted))).toBe(false);
    link('abs');
    const down = reachWith(async () => new Response('', { status: 503 }));
    await expect(down.reaches(user, rowIn(granted))).rejects.toThrow();
  });

  it('[M3.requests/d] asks each person’s own account once a minute, unless asked afresh', async () => {
    link('abs');
    const asks: string[] = [];
    const replay = replayFetch([meOf(restricted)]);
    const reach = reachWith((url, init) => {
      asks.push(url);
      return replay(url, init);
    });
    await reach.reaches(user, rowIn(granted));
    await reach.reaches(user, rowIn('another-library'));
    expect(asks).toHaveLength(1);
    await reach.reaches(user, rowIn(granted), true);
    expect(asks).toHaveLength(2);
  });
});

describe('[M3.requests/d] a standing with what Auralis holds', () => {
  const book = { source: 'abs' as const, id: 'book' };

  it('[M3.requests/d] shows the held position with no account of their own', () => {
    keepHeld(db, user.id, book, { position: 50, duration: 200 }, 1000);
    const access = withHeld(db, user.id, null, true)!;
    expect(access.standing('book')).toEqual({ progress: 0.25, finished: false, updatedAt: 1000 });
    expect(access.heard).toEqual([{ id: 'book', updatedAt: 1000 }]);
    expect(access.begun).toEqual(['book']);
    expect(access.open('any-library')).toBe(true);
  });

  it('[M3.requests/d] counts one within half a minute of its end as finished', () => {
    keepHeld(db, user.id, book, { position: 190, duration: 200 }, 1000);
    expect(withHeld(db, user.id, null, true)!.standing('book')).toMatchObject({
      progress: 1,
      finished: true,
    });
  });

  it('[M3.requests/d] is nothing with neither an account nor Auralis’s key', () => {
    expect(withHeld(db, user.id, null, false)).toBeNull();
  });
});

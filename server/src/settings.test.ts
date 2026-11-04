/**
 * Each person's settings through the real routes: the theme, the autoplay switches, the queue
 * style, whether first-run setup is done and whether the library shows everyone's, the same on
 * every device of theirs.
 */
import { DEFAULT_SETTINGS, SESSION_COOKIE, Settings, type SettingsBody } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { upsertUser } from './store/users.js';

const PUBLIC = 'https://audio.example.org';

let db: Db;
let app: FastifyInstance;
/** kara's laptop and phone, and otto's laptop: a signed-in cookie for each. */
const cookies: Record<string, string> = {};
beforeEach(async () => {
  db = openDatabase(':memory:');
  for (const [device, name] of [
    ['kara', 'kara'],
    ['kara-phone', 'kara'],
    ['otto', 'otto'],
  ] as const) {
    const user = upsertUser(db, { username: name, role: 'member' });
    const { id } = createDevice(db, { userId: user.id, kind: 'web' });
    cookies[device] =
      `${SESSION_COOKIE}=${createSession(db, { userId: user.id, deviceId: id }).token}`;
  }
  app = await buildApp({ webDistDir: null, db, publicOrigin: PUBLIC });
});
afterEach(async () => {
  await app.close();
  db.close();
});

const get = (device: string | null = 'kara') =>
  app.inject({
    method: 'GET',
    url: '/api/settings',
    headers: device === null ? {} : { cookie: cookies[device] ?? '' },
  });
const put = (payload: unknown, device: string | null = 'kara', origin = PUBLIC) =>
  app.inject({
    method: 'PUT',
    url: '/api/settings',
    headers: device === null ? { origin } : { cookie: cookies[device] ?? '', origin },
    payload: payload as object,
  });
const read = async (device = 'kara') => {
  const res = await get(device);
  expect(res.statusCode).toBe(200);
  return Settings.parse(res.json());
};
const change = async (body: SettingsBody, device = 'kara') => {
  const res = await put(body, device);
  expect(res.statusCode).toBe(200);
  return Settings.parse(res.json());
};

const EVERY_CHANGED: Settings = {
  theme: 'dark',
  autoplay: { music: false, spoken: false },
  queueStyle: 'spotify',
  firstRunDone: true,
  showEveryonesLibrary: true,
};

describe('[M2.settings/a] settings per person through GET/PUT /api/settings', () => {
  it('[M2.settings/a] answer the defaults to a person who never changed one', async () => {
    expect(await read()).toEqual(DEFAULT_SETTINGS);
  });

  it('[M2.settings/a] round-trip every setting, away from its default and back again', async () => {
    expect(await change(EVERY_CHANGED)).toEqual(EVERY_CHANGED);
    expect(await read()).toEqual(EVERY_CHANGED);

    expect(await change(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(await read()).toEqual(DEFAULT_SETTINGS);

    // Each other value of the theme round-trips too.
    for (const theme of ['light', 'system'] as const) {
      await change({ theme });
      expect((await read()).theme).toBe(theme);
    }
  });

  it('[M2.settings/a] change only what a change names, down to one autoplay switch', async () => {
    await change(EVERY_CHANGED);

    expect(await change({ autoplay: { music: true } })).toEqual({
      ...EVERY_CHANGED,
      autoplay: { music: true, spoken: false },
    });
    expect(await change({ theme: 'light' })).toEqual({
      ...EVERY_CHANGED,
      theme: 'light',
      autoplay: { music: true, spoken: false },
    });
    expect(await change({})).toEqual(await read());
  });

  it('[M2.settings/a] are the same on every device of a person’s, and never reach anyone else', async () => {
    await change(EVERY_CHANGED, 'kara-phone');

    expect(await read('kara')).toEqual(EVERY_CHANGED);
    expect(await read('otto')).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['an unknown setting', { volume: 3 }],
    ['an unknown autoplay switch', { autoplay: { video: true } }],
    ['a theme no setting takes', { theme: 'blue' }],
    ['a queue style no setting takes', { queueStyle: 'apple' }],
  ])('[M2.settings/a] answer 400 to %s, changing nothing', async (_what, body) => {
    expect((await put(body)).statusCode).toBe(400);
    expect(await read()).toEqual(DEFAULT_SETTINGS);
  });

  it('[M2.settings/a] answer 401 to no one signed in', async () => {
    expect((await get(null)).statusCode).toBe(401);
    expect((await put({ theme: 'dark' }, null)).statusCode).toBe(401);
  });

  it('[M2.settings/a] refuse a change from another site', async () => {
    const res = await put({ theme: 'dark' }, 'kara', 'https://elsewhere.example');

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'cross_origin' });
    expect(await read()).toEqual(DEFAULT_SETTINGS);
  });
});

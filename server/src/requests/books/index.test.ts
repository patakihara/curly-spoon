/**
 * Whether books can be requested on this server, as `main.ts` assembles it: only with everything
 * they need, and never at the cost of the rest. No upstream is reached here but to refuse.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { loadConfig } from '../../config.js';
import { assembleServer, type Server } from '../../server.js';
import { openDatabase } from '../../store/connection.js';
import { createDevice } from '../../store/devices.js';
import { getRequest } from '../../store/requests.js';
import { createSession } from '../../store/sessions.js';
import { upsertUser } from '../../store/users.js';
import { bookSteps } from './index.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const ASIN = 'B000000001';

let dir: string;
let env: Record<string, string>;
let servers: Server[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-book-steps-'));
  servers = [];
  const keys = join(dir, 'keys.env');
  writeFileSync(
    keys,
    ['PROWLARR_API_KEY', 'QBITTORRENT_API_KEY', 'ABS_API_KEY', 'ABS_PROVISION_KEY']
      .map((name) => `${name}=a-${name}`)
      .join('\n'),
  );
  mkdirSync(join(dir, 'media/Books'), { recursive: true });
  env = {
    DATA_DIR: join(dir, 'data'),
    SECRET_KEY: KEY,
    INDEX_EVERY_MINUTES: '0',
    LYRICS_EVERY_MINUTES: '0',
    LRCLIB_URL: '',
    ABS_URL: 'http://abs.invalid',
    ABS_PROVISION_KEY_FILE: keys,
    ABS_API_KEY_FILE: keys,
    PROWLARR_URL: 'http://prowlarr.invalid',
    PROWLARR_API_KEY_FILE: keys,
    QBITTORRENT_URL: 'http://qbittorrent.invalid',
    QBITTORRENT_API_KEY_FILE: keys,
    QBITTORRENT_DOWNLOADS_PATH: '/data/Downloads',
    MEDIA_DIR: join(dir, 'media'),
  };
});
afterEach(async () => {
  for (const server of servers) await server.close().catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
});

const without = (name: string) =>
  Object.fromEntries(Object.entries(env).filter(([one]) => one !== name));

const noFetch: FetchLike = async (url) => {
  throw new Error(`no network in this test: ${url}`);
};
const log = { error: () => undefined };
const db = () => openDatabase(':memory:');
const stepsWith = (vars: Record<string, string>) =>
  bookSteps(loadConfig(vars), { db: db(), fetch: noFetch, log, now: Date.now });

describe('book steps from the configuration', () => {
  it('registers with all of it, and calls nothing to do so', () => {
    const calls: string[] = [];
    const made = bookSteps(loadConfig(env), {
      db: db(),
      fetch: async (url) => {
        calls.push(url);
        throw new Error('refused');
      },
      log,
      now: Date.now,
    });
    expect('steps' in made && made.steps.medium).toBe('book');
    expect(calls).toEqual([]);
  });

  it.each([
    ['ABS_URL', 'ABS_URL'],
    ['ABS_API_KEY_FILE', 'ABS_API_KEY_FILE'],
    ['PROWLARR_URL', 'PROWLARR_URL'],
    ['PROWLARR_API_KEY_FILE', 'PROWLARR_API_KEY_FILE'],
    ['QBITTORRENT_URL', 'QBITTORRENT_URL'],
    ['QBITTORRENT_API_KEY_FILE', 'QBITTORRENT_API_KEY_FILE'],
    ['QBITTORRENT_DOWNLOADS_PATH', 'QBITTORRENT_DOWNLOADS_PATH'],
    ['MEDIA_DIR', 'MEDIA_DIR'],
  ])('without %s there are no steps, and it says what is missing', (name, named) => {
    const vars = without(name);
    if (name === 'ABS_URL') {
      delete vars['ABS_PROVISION_KEY_FILE'];
      delete vars['ABS_API_KEY_FILE'];
    }
    const made = stepsWith(vars);
    expect('off' in made && made.off).toContain(named);
  });

  it('without a Books folder there are no steps', () => {
    expect(stepsWith({ ...env, MEDIA_DIR: join(dir, 'nothing') })).toEqual({
      off: 'a Books folder in MEDIA_DIR',
    });
  });

  it('a key its file does not hold keeps books off, naming no value, and does not throw', () => {
    const keys = join(dir, 'short.env');
    writeFileSync(keys, 'ABS_API_KEY=value-kept-out-of-sight\n');
    const made = stepsWith({ ...env, PROWLARR_API_KEY_FILE: keys });
    expect(made).toEqual({ off: 'a key their files should hold' });
    expect(JSON.stringify(made)).not.toContain('value-kept-out-of-sight');
  });

  it('a missing key file keeps books off and does not throw', () => {
    const made = stepsWith({ ...env, QBITTORRENT_API_KEY_FILE: join(dir, 'gone') });
    expect(made).toEqual({ off: 'a key their files should hold' });
  });
});

describe('the server with book steps', () => {
  const signedIn = (dataDir: string) => {
    mkdirSync(dataDir, { recursive: true });
    const store = openDatabase(join(dataDir, 'auralis.sqlite'));
    try {
      const kara = upsertUser(store, { username: 'kara', role: 'member' });
      const device = createDevice(store, { userId: kara.id, kind: 'web' });
      return createSession(store, { userId: kara.id, deviceId: device.id, kind: 'bearer' }).token;
    } finally {
      store.close();
    }
  };

  const assembled = async (vars: Record<string, string>) => {
    const calls: string[] = [];
    const bearer = signedIn(vars['DATA_DIR'] as string);
    const server = await assembleServer(loadConfig(vars), {
      // Every upstream refuses the connection, as a qBittorrent behind a flapping tunnel does.
      fetch: async (url) => {
        calls.push(new URL(url).origin);
        throw new TypeError('connection refused');
      },
      logger: false,
    });
    servers.push(server);
    const request = () =>
      server.app.inject({
        method: 'POST',
        url: '/api/requests',
        headers: { authorization: `Bearer ${bearer}` },
        payload: {
          ref: {
            medium: 'book',
            target: { title: 'A Quiet Book', creator: 'Ann Author', ids: { asin: ASIN } },
          },
        },
      });
    return { server, request, calls };
  };

  it('starts and answers health with every upstream refusing, and reaches none of them', async () => {
    const { server, calls } = await assembled(env);
    const health = await server.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(calls).toEqual([]);
  });

  it('takes a book request with qBittorrent refusing; the request waits rather than the server', async () => {
    const { request } = await assembled(env);
    const answer = await request();
    expect(answer.statusCode).toBeLessThan(300);
    const { id } = answer.json<{ id: string }>();
    const store = openDatabase(join(env['DATA_DIR'] as string, 'auralis.sqlite'));
    try {
      expect(getRequest(store, id)?.medium).toBe('book');
    } finally {
      store.close();
    }
  });

  it('answers 409 for a book when one setting is missing, and health is unchanged', async () => {
    const { server, request } = await assembled(without('MEDIA_DIR'));
    const answer = await request();
    expect(answer.statusCode).toBe(409);
    expect(answer.json<{ error: string }>().error).toBe('medium_unavailable');
    const health = await server.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
  });
});

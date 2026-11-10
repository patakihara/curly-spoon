/**
 * Whether albums can be requested on this server, as `main.ts` assembles it: only with everything
 * they need, and never at the cost of the rest. No upstream is reached here but to refuse.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { albumSteps } from './index.js';

const KEY = Buffer.alloc(32, 7).toString('base64');
const MBID = '5990b23f-6412-3eaf-989c-a4831f4f95f7';

let dir: string;
let env: Record<string, string>;
let servers: Server[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-album-steps-'));
  servers = [];
  const keys = join(dir, 'keys.env');
  writeFileSync(
    keys,
    ['PROWLARR_API_KEY', 'QBITTORRENT_API_KEY'].map((name) => `${name}=a-${name}`).join('\n'),
  );
  writeFileSync(join(dir, 'jellyfin.key'), 'a-jellyfin-key');
  mkdirSync(join(dir, 'media/Music'), { recursive: true });
  env = {
    DATA_DIR: join(dir, 'data'),
    SECRET_KEY: KEY,
    INDEX_EVERY_MINUTES: '0',
    LYRICS_EVERY_MINUTES: '0',
    LRCLIB_URL: '',
    PROWLARR_URL: 'http://prowlarr.invalid',
    PROWLARR_API_KEY_FILE: keys,
    QBITTORRENT_URL: 'http://qbittorrent.invalid',
    QBITTORRENT_API_KEY_FILE: keys,
    QBITTORRENT_DOWNLOADS_PATH: '/data/Downloads',
    MEDIA_DIR: join(dir, 'media'),
    JELLYFIN_URL: 'http://jellyfin.invalid',
    JELLYFIN_API_KEY_FILE: join(dir, 'jellyfin.key'),
    MUSICBRAINZ_URL: 'http://musicbrainz.invalid',
    COVERART_URL: 'http://coverart.invalid',
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
const stepsWith = (vars: Record<string, string>) =>
  albumSteps(loadConfig(vars), {
    db: openDatabase(':memory:'),
    fetch: noFetch,
    log,
    now: Date.now,
    people: () => [],
  });

describe('[M3.albums] album steps from the configuration', () => {
  it('[M3.albums] registers with all of it, with a catalogue for Search, and calls nothing to do so', () => {
    const calls: string[] = [];
    const made = albumSteps(loadConfig(env), {
      db: openDatabase(':memory:'),
      fetch: async (url) => {
        calls.push(url);
        throw new Error('refused');
      },
      log,
      now: Date.now,
      people: () => {
        calls.push('people');
        return [];
      },
    });
    expect('steps' in made && made.steps.medium).toBe('album');
    expect('steps' in made && made.steps.download).toBeDefined();
    expect('catalogue' in made && made.catalogue.hasArt).toBe(true);
    expect(calls).toEqual([]);
  });

  it('[M3.albums] without the Cover Art Archive, albums are still requested, their rows without covers', () => {
    const made = stepsWith({ ...env, COVERART_URL: '' });
    expect('catalogue' in made && made.catalogue.hasArt).toBe(false);
  });

  it.each([
    ['PROWLARR_URL', 'PROWLARR_URL'],
    ['PROWLARR_API_KEY_FILE', 'PROWLARR_API_KEY_FILE'],
    ['QBITTORRENT_URL', 'QBITTORRENT_URL'],
    ['QBITTORRENT_API_KEY_FILE', 'QBITTORRENT_API_KEY_FILE'],
    ['QBITTORRENT_DOWNLOADS_PATH', 'QBITTORRENT_DOWNLOADS_PATH'],
    ['MEDIA_DIR', 'MEDIA_DIR'],
    ['JELLYFIN_URL', 'JELLYFIN_URL'],
  ])('[M3.albums] without %s there are no steps, and it says what is missing', (name, named) => {
    const vars = without(name);
    if (name === 'JELLYFIN_URL') delete vars['JELLYFIN_API_KEY_FILE'];
    const made = stepsWith(vars);
    expect('off' in made && made.off).toContain(named);
  });

  it('[M3.albums] with MusicBrainz switched off there are no steps', () => {
    expect(stepsWith({ ...env, MUSICBRAINZ_URL: '' })).toEqual({ off: 'MUSICBRAINZ_URL' });
  });

  it('[M3.albums] without a Music folder there are no steps', () => {
    rmSync(join(dir, 'media/Music'), { recursive: true });
    expect(stepsWith(env)).toEqual({ off: 'a Music folder in MEDIA_DIR' });
  });

  it('[M3.albums] a media folder it may not look inside keeps albums off and does not throw', () => {
    const shut = join(dir, 'shut');
    mkdirSync(join(shut, 'Music'), { recursive: true });
    chmodSync(shut, 0o000);
    try {
      expect(stepsWith({ ...env, MEDIA_DIR: shut })).toEqual({
        off: 'a Music folder in MEDIA_DIR it may look inside',
      });
    } finally {
      chmodSync(shut, 0o700);
    }
  });

  it('[M3.albums] a key its file does not hold keeps albums off, naming no value, and does not throw', () => {
    const keys = join(dir, 'short.env');
    writeFileSync(keys, 'OTHER_KEY=value-kept-out-of-sight\n');
    const made = stepsWith({ ...env, QBITTORRENT_API_KEY_FILE: keys });
    expect(made).toEqual({ off: 'a key their files should hold' });
    expect(JSON.stringify(made)).not.toContain('value-kept-out-of-sight');
  });

  it('[M3.albums] a missing Jellyfin key file keeps albums off and does not throw', () => {
    const made = stepsWith({ ...env, JELLYFIN_API_KEY_FILE: join(dir, 'gone') });
    expect(made).toEqual({ off: 'a key their files should hold' });
  });
});

describe('[M3.albums] the server with album steps', () => {
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
            medium: 'album',
            target: { title: 'The Slip', creator: 'Nine Inch Nails', ids: { mbid: MBID } },
          },
        },
      });
    return { server, request, calls };
  };

  it('[M3.albums] starts and answers health with every upstream refusing, and reaches none of them', async () => {
    const { server, calls } = await assembled(env);
    const health = await server.app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(calls).toEqual([]);
  });

  it('[M3.albums] takes an album request with every upstream refusing; the request waits rather than the server', async () => {
    const { request } = await assembled(env);
    const answer = await request();
    expect(answer.statusCode).toBeLessThan(300);
    const { id } = answer.json<{ id: string }>();
    const store = openDatabase(join(env['DATA_DIR'] as string, 'auralis.sqlite'));
    try {
      expect(getRequest(store, id)?.medium).toBe('album');
    } finally {
      store.close();
    }
  });

  it.each(['PROWLARR_URL', 'QBITTORRENT_DOWNLOADS_PATH', 'MEDIA_DIR', 'JELLYFIN_URL'])(
    '[M3.albums] answers 409 for an album without %s, and health is unchanged',
    async (name) => {
      const vars = without(name);
      if (name === 'JELLYFIN_URL') delete vars['JELLYFIN_API_KEY_FILE'];
      const { server, request } = await assembled(vars);
      const answer = await request();
      expect(answer.statusCode).toBe(409);
      expect(answer.json<{ error: string }>().error).toBe('medium_unavailable');
      const health = await server.app.inject({ method: 'GET', url: '/api/health' });
      expect(health.statusCode).toBe(200);
    },
  );

  it('[M3.albums] answers 409 for an album with MusicBrainz switched off', async () => {
    const { request } = await assembled({ ...env, MUSICBRAINZ_URL: '' });
    expect((await request()).statusCode).toBe(409);
  });
});

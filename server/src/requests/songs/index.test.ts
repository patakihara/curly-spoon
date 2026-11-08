/**
 * Whether songs can be kept on this server: only with everything they need, and never at the cost
 * of the rest. Nothing here reaches an upstream.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { loadConfig } from '../../config.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, saveRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import type { SongStream } from './download.js';
import { songSteps, STAGING_FOLDER } from './index.js';

let dir: string;
let env: Record<string, string>;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-song-steps-'));
  mkdirSync(join(dir, 'media/Music'), { recursive: true });
  writeFileSync(join(dir, 'jellyfin.key'), 'a-key');
  env = {
    JELLYFIN_URL: 'http://jellyfin.invalid',
    JELLYFIN_API_KEY_FILE: join(dir, 'jellyfin.key'),
    MEDIA_DIR: join(dir, 'media'),
  };
  db = openDatabase(':memory:');
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const calls: string[] = [];
const noFetch: FetchLike = async (url) => {
  calls.push(url);
  throw new Error(`no network in this test: ${url}`);
};
const music: SongStream = { open: () => Promise.reject(new Error('nothing streams here')) };
const stepsWith = (vars: Record<string, string>, streams: SongStream | null = music) =>
  songSteps(loadConfig(vars), {
    db,
    fetch: noFetch,
    log: { error: () => undefined },
    music: streams,
    wake: () => undefined,
  });
const without = (name: string) =>
  Object.fromEntries(Object.entries(env).filter(([one]) => one !== name));

describe('[M3.keep] song steps from the configuration', () => {
  it('[M3.keep] registers with all of it, prompt, and calls nothing to do so', () => {
    const made = stepsWith(env);
    expect('steps' in made && made.steps).toMatchObject({ medium: 'song', prompt: true });
    expect(existsSync(join(dir, 'media/Music', STAGING_FOLDER))).toBe(true);
    expect(calls).toEqual([]);
  });

  it('[M3.keep] says which setting is missing: songs that stream, Jellyfin, MEDIA_DIR, its Music folder', () => {
    expect(stepsWith(env, null)).toEqual({ off: 'EXTRACTOR_PATH' });
    expect(stepsWith(without('JELLYFIN_URL'))).toEqual({
      off: 'JELLYFIN_URL and JELLYFIN_API_KEY_FILE',
    });
    expect(stepsWith(without('MEDIA_DIR'))).toEqual({ off: 'MEDIA_DIR' });
    rmSync(join(dir, 'media/Music'), { recursive: true });
    expect(stepsWith(env)).toEqual({ off: 'a Music folder in MEDIA_DIR' });
  });

  it('[M3.keep] at start, deletes what is staged for no live request, and keeps a failed one’s', () => {
    const staging = join(dir, 'media/Music', STAGING_FOLDER);
    mkdirSync(staging, { recursive: true });
    const user = upsertUser(db, { username: 'ana', role: 'member' }).id;
    const ask = (id: string) =>
      createRequest(
        db,
        user,
        { medium: 'song', target: { title: id, creator: null, ids: { youtubeMusicId: id } } },
        1,
      ).request;
    const failed = ask('failedSong1');
    saveRequest(
      db,
      failed.id,
      {
        state: { status: 'failed', failedStep: 'downloading', reason: 'downloadFailed' },
      },
      2,
    );
    const arrived = ask('landedSong1');
    saveRequest(
      db,
      arrived.id,
      { state: { status: 'inLibrary' }, result: { source: 'jellyfin', id: 'a-track' } },
      2,
    );
    for (const name of ['failedSong1.webm', 'landedSong1.webm', 'nobodysSong.webm']) {
      writeFileSync(join(staging, name), 'bytes');
    }

    expect('steps' in stepsWith(env)).toBe(true);
    expect(existsSync(join(staging, 'failedSong1.webm'))).toBe(true);
    expect(existsSync(join(staging, 'landedSong1.webm'))).toBe(false);
    expect(existsSync(join(staging, 'nobodysSong.webm'))).toBe(false);
  });
});

/**
 * The whole server as `main.ts` assembles it, on the recordings: Jellyfin answers the person's
 * recorded views, LRCLIB its recorded records, held until the test lets them through, and the
 * index holds Random Access Memories with Get Lucky and one more track, recorded, after a whole
 * Jellyfin index pass, so the lyrics backfill starts at once. Nothing leaves the machine.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Lyrics as LyricsBody } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { indexItemSchema, indexQueryResultSchema } from './adapters/jellyfin/schemas.js';
import { loadConfig } from './config.js';
import { albumRow, trackRows } from './libraryIndex/rows.js';
import { applyTree, emptyCounts, recordRun } from './libraryIndex/store.js';
import { assembleServer, type Server } from './server.js';
import { openDatabase } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { saveLink } from './store/upstreamLinks.js';
import { upsertUser } from './store/users.js';

const KEY = Buffer.alloc(32, 7);
const JELLYFIN = 'http://jellyfin.upstream.invalid';
const LRCLIB = 'http://lrclib.upstream.invalid';
const GET_LUCKY = '484fcbfff6efe11cfeb2028d3a7babc7';

function recording(upstream: 'jellyfin' | 'lrclib', call: string): Recording {
  const file = fileURLToPath(
    new URL(`./adapters/${upstream}/recordings/${call}.json`, import.meta.url),
  );
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
const json = <T>(r: Recording) => (r.response.body as { json: T }).json;

const userViews = recording('jellyfin', 'jf-user-views');
const MUSIC = json<{ Items: { Id: string }[] }>(userViews).Items[0]!.Id;

let dir: string;
let servers: Server[];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'auralis-server-'));
  servers = [];
});
afterEach(async () => {
  for (const server of servers) await server.close().catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
});

/**
 * The data folder as the server finds it: the album with `tracks` of its recorded tracks, a
 * whole index pass, and kara, linked to Jellyfin, signed in. Returns kara's bearer token.
 */
function dataFolder(dataDir: string, tracks: number): string {
  mkdirSync(dataDir, { recursive: true });
  const db = openDatabase(join(dataDir, 'auralis.sqlite'));
  try {
    const album = indexItemSchema.parse(
      indexQueryResultSchema.parse(json(recording('jellyfin', 'lyrics-album-1'))).Items[0],
    );
    const listed = json<{ Items: { Id: string }[] }>(recording('jellyfin', 'lyrics-album-1-tracks'))
      .Items.toSorted((a, b) => Number(b.Id === GET_LUCKY) - Number(a.Id === GET_LUCKY))
      .slice(0, tracks)
      .map((t) => indexItemSchema.parse(t));
    applyTree(
      db,
      { top: albumRow(album, MUSIC), children: trackRows(album.Id, MUSIC, listed) },
      Date.now(),
      emptyCounts(),
    );
    const at = Date.now();
    recordRun(db, {
      source: 'jellyfin',
      startedAt: at,
      finishedAt: at,
      complete: true,
      error: null,
      counts: emptyCounts(),
    });
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    saveLink(db, KEY, {
      userId: kara.id,
      service: 'jellyfin',
      upstreamUserId: 'jellyfin-kara',
      token: 'jellyfin-token-kara',
      state: 'linked',
    });
    const device = createDevice(db, { userId: kara.id, kind: 'web' });
    return createSession(db, { userId: kara.id, deviceId: device.id, kind: 'bearer' }).token;
  } finally {
    db.close();
  }
}

/** The assembled server, with LRCLIB held until `answer()`; every LRCLIB call names its track. */
async function assembled(tracks: number) {
  const dataDir = join(dir, 'data');
  const bearer = dataFolder(dataDir, tracks);
  const keyFile = join(dir, 'jellyfin-api-key');
  writeFileSync(keyFile, 'test-key\n', { mode: 0o600 });
  const config = loadConfig({
    DATA_DIR: dataDir,
    JELLYFIN_URL: JELLYFIN,
    JELLYFIN_API_KEY_FILE: keyFile,
    SECRET_KEY: KEY.toString('base64'),
    INDEX_EVERY_MINUTES: '0',
    LYRICS_EVERY_MINUTES: '60',
    LRCLIB_URL: LRCLIB,
  });

  let answer: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  const lrclibAsked: string[] = [];
  let viewsAsked = false;
  const jellyfin = replayFetch([
    userViews,
    ...['jf-lyrics-synced', 'jf-lyrics-plain', 'jf-lyrics-none'].map((c) =>
      recording('jellyfin', c),
    ),
  ]);
  const lrclib = replayFetch(
    ['lrclib-get-synced', 'lrclib-get-missing', 'lrclib-get-instrumental'].map((c) =>
      recording('lrclib', c),
    ),
  );
  const fetch: FetchLike = async (url, init) => {
    const { origin, pathname, searchParams } = new URL(url);
    if (origin === LRCLIB) {
      lrclibAsked.push(searchParams.get('track_name') ?? pathname);
      await answered;
      return lrclib(url, init);
    }
    if (origin === JELLYFIN) {
      if (pathname === '/UserViews') viewsAsked = true;
      return jellyfin(url, init);
    }
    throw new Error(`no network in this test: ${url}`);
  };
  const logs: string[] = [];
  const server = await assembleServer(config, {
    fetch,
    logger: { stream: { write: (line) => logs.push((JSON.parse(line) as { msg: string }).msg) } },
  });
  servers.push(server);
  const lyricsOf = (id: string) =>
    server.app.inject({
      method: 'GET',
      url: `/api/lyrics/jellyfin:${id}`,
      headers: { authorization: `Bearer ${bearer}` },
    });
  return { server, lyricsOf, answer, lrclibAsked, logs, viewsAsked: () => viewsAsked };
}

const ticks = async (until: () => boolean = () => false, most = 200) => {
  for (let i = 0; i < most && !until(); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

describe('the server as main.ts assembles it', () => {
  it('gives the lyrics route and the backfill one lyrics service, asking LRCLIB once for a track both want', async () => {
    const s = await assembled(1);
    // The backfill starts at once and asks LRCLIB for the one track.
    await ticks(() => s.lrclibAsked.length > 0);
    expect(s.lrclibAsked).toEqual(['Get Lucky']);

    const asking = s.lyricsOf(GET_LUCKY);
    await ticks(s.viewsAsked);
    await ticks();
    s.answer();
    const res = await asking;

    expect(res.statusCode).toBe(200);
    expect(LyricsBody.parse(res.json())).toMatchObject({ status: 'synced', source: 'lrclib' });
    expect(s.lrclibAsked).toEqual(['Get Lucky']);
  });

  it('stops the backfill on close: a run going ends before its next track', async () => {
    const s = await assembled(2);
    await ticks(() => s.lrclibAsked.length > 0);
    expect(s.lrclibAsked).toHaveLength(1);

    await s.server.close();
    s.answer();

    await vi.waitFor(
      () =>
        expect(s.logs.filter((m) => m === 'lyrics run done' || m === 'job failed')).toEqual([
          'lyrics run done',
        ]),
      { timeout: 3_000 },
    );
    expect(s.lrclibAsked).toHaveLength(1);
  });
});

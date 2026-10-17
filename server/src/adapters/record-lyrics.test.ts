import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { type Recording, recordingSchema } from './http/recording.js';
import { LRCLIB_USER_AGENT } from './lrclib/client.js';
import { runRecord } from './record-cli.js';
import { LYRICS_TRIMMED, recordLyrics, trimLyricsExchange } from './record-lyrics.js';
import { type RawExchange } from './http/scrub.js';

const JF = 'http://jellyfin.invalid:8096';
const LRCLIB = 'https://lrclib.invalid';

/** Three albums of two tracks each; the second track of the first album has no artist of its own. */
const ALBUMS = {
  ram: {
    album: {
      Id: 'ram',
      Name: 'Random Album',
      Type: 'MusicAlbum',
      AlbumArtists: [{ Id: 'd', Name: 'Duo' }],
    },
    tracks: [
      {
        Id: 'lucky',
        Name: 'Lucky',
        Type: 'Audio',
        RunTimeTicks: 3_696_000_000,
        ArtistItems: [{ Id: 'd', Name: 'Duo feat. Singer' }],
      },
      { Id: 'synced', Name: 'Synced Song', Type: 'Audio', RunTimeTicks: 2_000_000_000 },
    ],
  },
  eyr: {
    album: {
      Id: 'eyr',
      Name: 'Rabbit',
      Type: 'MusicAlbum',
      AlbumArtists: [{ Id: 'r', Name: 'Rabbit Band' }],
    },
    tracks: [
      {
        Id: 'rat',
        Name: 'Rat',
        Type: 'Audio',
        RunTimeTicks: 5_026_000_000,
        ArtistItems: [{ Id: 'r', Name: 'Rabbit Band' }],
      },
      { Id: 'plain', Name: 'Plain Song', Type: 'Audio', RunTimeTicks: 1_000_000_000 },
    ],
  },
  mtm: {
    album: {
      Id: 'mtm',
      Name: 'Midnight (Deluxe Edition)',
      Type: 'MusicAlbum',
      AlbumArtists: [{ Id: 'p', Name: 'Park' }],
    },
    tracks: [
      {
        Id: 'wake',
        Name: 'Wake',
        Type: 'Audio',
        RunTimeTicks: 1_007_000_000,
        ArtistItems: [{ Id: 'p', Name: 'Park' }],
      },
    ],
  },
} as const;

const lines = (n: number, start = true) =>
  Array.from({ length: n }, (_, i) => ({
    Text: i === 2 ? '' : `line ${i + 1}`,
    ...(start ? { Start: (i + 1) * 10_000_000 } : {}),
    Cues: [],
  }));

const LRC = Array.from({ length: 9 }, (_, i) => `[00:0${i}.00] sung ${i + 1}`).join('\r\n');
const PLAIN = Array.from({ length: 9 }, (_, i) => `sung ${i + 1}`).join('\n');

interface FakeOptions {
  /** LRCLIB answers 503 this many times before answering the synced lookup. */
  busy?: number;
  /** What Jellyfin answers for the plain track's lyrics. */
  plainLyrics?: unknown;
  /** The status LRCLIB's busy answers carry; 503 when not given. */
  busyStatus?: number;
  /** What LRCLIB answers for the instrumental track, in place of its instrumental record. */
  wake?: unknown;
  /** Jellyfin's logout fails with a network error. */
  logoutFails?: boolean;
}

function fakeUpstreams(options: FakeOptions = {}) {
  const asked: string[] = [];
  let busy = options.busy ?? 0;
  const json = (body: unknown, status = 200, type = 'application/json; charset=utf-8') =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
  const notFound = () =>
    json({ title: 'Not Found', status: 404 }, 404, 'application/problem+json; charset=utf-8');
  const fetch: FetchLike = async (input, init) => {
    const u = new URL(input);
    const method = init?.method ?? 'GET';
    const p = u.pathname;
    const q = u.searchParams;
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    const who = auth.includes('Token="minted"')
      ? 'person'
      : auth.includes('Token=')
        ? 'key'
        : 'none';
    asked.push(`${method} ${u.origin === LRCLIB ? 'lrclib' : 'jf'} ${p}${u.search} ${who}`);
    if (u.origin === LRCLIB && p === '/api/get') {
      const track = q.get('track_name');
      if (track === 'Lucky') {
        if (busy > 0) {
          busy -= 1;
          return json(
            { message: 'The server is busy, please retry in a moment', statusCode: 503 },
            options.busyStatus ?? 503,
          );
        }
        return json({
          id: 11,
          name: 'Lucky',
          trackName: 'Lucky',
          artistName: q.get('artist_name'),
          albumName: q.get('album_name'),
          duration: 370,
          instrumental: false,
          hasWordSync: false,
          plainLyrics: PLAIN,
          syncedLyrics: LRC,
          lyricsfile: 'version: 1\nlines: many',
        });
      }
      if (track === 'Wake') {
        if (options.wake !== undefined) return json(options.wake);
        return json({
          id: 12,
          name: 'Wake',
          trackName: 'Wake',
          artistName: 'Park',
          albumName: q.get('album_name'),
          duration: 101,
          instrumental: true,
          hasWordSync: false,
          plainLyrics: null,
          syncedLyrics: null,
          lyricsfile: null,
        });
      }
      return json(
        { message: 'Failed to find specified track', name: 'TrackNotFound', statusCode: 404 },
        404,
      );
    }
    if (u.origin === JF) {
      if (p === '/System/Info/Public') return json({ Version: '10.11.11' });
      if (p === '/Items' && q.get('Ids')) {
        const album = Object.values(ALBUMS).find((a) => a.album.Id === q.get('Ids'));
        return json({ Items: album ? [album.album] : [], TotalRecordCount: album ? 1 : 0 });
      }
      if (p === '/Items' && q.get('ParentId')) {
        const album = Object.values(ALBUMS).find((a) => a.album.Id === q.get('ParentId'));
        const tracks = album?.tracks ?? [];
        return json({ Items: tracks, TotalRecordCount: tracks.length });
      }
      if (p === '/Users')
        return json([{ Id: 'jfu', Name: 'auralis', Policy: { IsAdministrator: false } }]);
      if (p === '/QuickConnect/Initiate') return json({ Secret: 's', Code: '123456' });
      if (p === '/QuickConnect/Authorize') return json(true);
      if (p === '/Users/AuthenticateWithQuickConnect') {
        return json({ AccessToken: 'minted', User: { Id: 'jfu' } });
      }
      if (p === '/Audio/synced/Lyrics') return json({ Metadata: {}, Lyrics: lines(9) });
      if (p === '/Audio/plain/Lyrics') {
        return json(options.plainLyrics ?? { Metadata: {}, Lyrics: lines(6, false) });
      }
      if (p === '/Audio/lucky/Lyrics') return notFound();
      if (p === '/Sessions/Logout') {
        if (options.logoutFails) throw new TypeError('fetch failed');
        return new Response(null, { status: 204 });
      }
    }
    return new Response('Not Found', { status: 404 });
  };
  return { fetch, asked };
}

const FLAGS = [
  ...['--only', 'lyrics', '--jellyfin', JF, '--lrclib', LRCLIB, '--albums', 'ram,eyr,mtm'],
  ...['--jellyfin-synced', 'synced', '--jellyfin-plain', 'plain', '--lrclib-synced', 'lucky'],
  ...['--lrclib-missing', 'rat', '--lrclib-instrumental', 'wake', '--dry-run'],
];

async function run(options: FakeOptions = {}, argv = FLAGS, names?: string[]) {
  const fake = fakeUpstreams(options);
  const out: string[] = [];
  const err: string[] = [];
  const slept: number[] = [];
  const code = await runRecord({
    argv,
    stdin: 'JELLYFIN_API_KEY=jfkey\n',
    fetch: fake.fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    sleep: async (ms) => {
      slept.push(ms);
    },
    ...(names ? { names } : {}),
  }).catch((error: unknown) => error);
  const files = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
  const byCall = Object.fromEntries(files.map((f) => [read(f).call, read(f)]));
  return { code, out, err, files, byCall, slept, ...fake };
}

/** Runs the recorder itself into a fresh folder, and lists every file it left there. */
async function recordInto(options: FakeOptions = {}) {
  const fake = fakeUpstreams(options);
  const root = mkdtempSync(join(tmpdir(), 'auralis-lyrics-test-'));
  const out: string[] = [];
  const failure = await recordLyrics({
    fetch: fake.fetch,
    out: (l) => out.push(l),
    sleep: async () => undefined,
    root,
    jellyfinUrl: JF,
    jellyfinKey: 'jfkey',
    lrclibUrl: LRCLIB,
    albums: ['ram', 'eyr', 'mtm'],
    tracks: {
      jellyfinSynced: 'synced',
      jellyfinPlain: 'plain',
      lrclibSynced: 'lucky',
      lrclibMissing: 'rat',
      lrclibInstrumental: 'wake',
    },
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  const left = (readdirSync(root, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.split('/').at(-1))
    .sort();
  rmSync(root, { recursive: true, force: true });
  return { failure, out, left, ...fake };
}

const read = (file: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

function json(r: Recording | undefined): Record<string, unknown> {
  const body = r?.response.body;
  if (body == null || !('json' in body)) throw new Error('expected a JSON body');
  return body.json as Record<string, unknown>;
}

describe("record mode for M2.lrclib's lyrics", () => {
  it("records each album and its tracks, then Jellyfin's three lyrics answers, then LRCLIB's three, one request each", async () => {
    const { code, err, files } = await run();
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(files.map((f) => f.split('/').slice(-3).join('/'))).toEqual([
      'jellyfin/recordings/lyrics-album-1.json',
      'jellyfin/recordings/lyrics-album-1-tracks.json',
      'jellyfin/recordings/lyrics-album-2.json',
      'jellyfin/recordings/lyrics-album-2-tracks.json',
      'jellyfin/recordings/lyrics-album-3.json',
      'jellyfin/recordings/lyrics-album-3-tracks.json',
      'jellyfin/recordings/jf-lyrics-synced.json',
      'jellyfin/recordings/jf-lyrics-plain.json',
      'jellyfin/recordings/jf-lyrics-none.json',
      'lrclib/recordings/lrclib-get-synced.json',
      'lrclib/recordings/lrclib-get-missing.json',
      'lrclib/recordings/lrclib-get-instrumental.json',
    ]);
  });

  it('asks for the albums with the API key and for the lyrics as the test user, through the minted token', async () => {
    const { byCall } = await run();
    for (const call of ['lyrics-album-1', 'lyrics-album-3-tracks']) {
      expect(byCall[call]?.request.headers.authorization).toContain('DeviceId="auralis-server"');
    }
    for (const call of ['jf-lyrics-synced', 'jf-lyrics-plain', 'jf-lyrics-none']) {
      expect(byCall[call]?.request.headers.authorization).toContain('DeviceId="auralis-recorder"');
    }
    expect(byCall['jf-lyrics-none']?.request.path).toBe('/Audio/lucky/Lyrics');
    expect(byCall['jf-lyrics-none']?.response.status).toBe(404);
  });

  it("keeps the first four lines of each of Jellyfin's lyrics, and says it trimmed them", async () => {
    const { byCall } = await run();
    const synced = json(byCall['jf-lyrics-synced']);
    expect(synced.Lyrics).toEqual(lines(4));
    expect(synced.trimmed).toBe(LYRICS_TRIMMED);
    expect((json(byCall['jf-lyrics-plain']).Lyrics as unknown[]).length).toBe(4);
    expect(json(byCall['jf-lyrics-none'])).not.toHaveProperty('trimmed');
    expect(json(byCall['lyrics-album-1-tracks'])).not.toHaveProperty('trimmed');
  });

  it("keeps LRCLIB's first four lines of each kind, line ends as sent, drops lyricsfile, and says so", async () => {
    const { byCall } = await run();
    const synced = json(byCall['lrclib-get-synced']);
    expect(synced.syncedLyrics).toBe(LRC.split('\r\n').slice(0, 4).join('\r\n'));
    expect(synced.plainLyrics).toBe(PLAIN.split('\n').slice(0, 4).join('\n'));
    expect(synced).not.toHaveProperty('lyricsfile');
    expect(synced.trimmed).toBe(LYRICS_TRIMMED);
    const instrumental = json(byCall['lrclib-get-instrumental']);
    expect(instrumental).toMatchObject({
      instrumental: true,
      syncedLyrics: null,
      plainLyrics: null,
    });
    expect(instrumental).not.toHaveProperty('lyricsfile');
    expect(json(byCall['lrclib-get-missing'])).not.toHaveProperty('trimmed');
  });

  it("asks LRCLIB for each track by its recorded rows, with Auralis's User-Agent", async () => {
    const { byCall } = await run();
    expect(byCall['lrclib-get-synced']?.request.query).toEqual({
      artist_name: 'Duo feat. Singer',
      track_name: 'Lucky',
      album_name: 'Random Album',
      duration: '370',
    });
    expect(byCall['lrclib-get-missing']?.request.query).toMatchObject({ duration: '503' });
    expect(byCall['lrclib-get-instrumental']?.request.query).toMatchObject({
      album_name: 'Midnight (Deluxe Edition)',
      duration: '101',
    });
    for (const call of ['lrclib-get-synced', 'lrclib-get-missing', 'lrclib-get-instrumental']) {
      const r = byCall[call];
      expect(r?.upstream).toBe('lrclib');
      expect(r?.request.headers['user-agent']).toBe(LRCLIB_USER_AGENT);
      expect(r?.request.headers).not.toHaveProperty('authorization');
    }
  });

  it('waits ten seconds between LRCLIB calls, and logs out the minted token before asking LRCLIB', async () => {
    const { slept, asked } = await run();
    expect(slept).toEqual([10_000, 10_000]);
    const logout = asked.findIndex((a) => a.startsWith('POST jf /Sessions/Logout'));
    const first = asked.findIndex((a) => a.includes(' lrclib '));
    expect(logout).toBeGreaterThan(-1);
    expect(logout).toBeLessThan(first);
  });

  it('asks a busy LRCLIB again 30 s later, and records the answer it then gives', async () => {
    const { code, slept, asked, byCall } = await run({ busy: 2 });
    expect(code).toBe(0);
    expect(slept).toEqual([30_000, 30_000, 10_000, 10_000]);
    expect(asked.filter((a) => a.includes('track_name=Lucky'))).toHaveLength(3);
    expect(byCall['lrclib-get-synced']?.response.status).toBe(200);
  });

  it('fails the run when LRCLIB is still busy after three more tries', async () => {
    const { code, asked, slept } = await run({ busy: 4 });
    expect(String(code)).toMatch(/503/);
    expect(asked.filter((a) => a.includes('track_name=Lucky'))).toHaveLength(4);
    expect(slept).toEqual([30_000, 30_000, 30_000]);
  });

  it("fails, and still logs out, when a track's lyrics are not of the kind it was chosen for", async () => {
    const { code, asked } = await run({ plainLyrics: { Metadata: {}, Lyrics: lines(3) } });
    expect(String(code)).toMatch(/plain/);
    expect(asked.at(-1)).toMatch(/^POST jf \/Sessions\/Logout /);
    expect(asked.filter((a) => a.includes(' lrclib '))).toEqual([]);
  });

  it('asks LRCLIB only once when it fails with any status but 503', async () => {
    const { code, asked, slept } = await run({ busy: 1, busyStatus: 500 });
    expect(String(code)).toMatch(/500/);
    expect(asked.filter((a) => a.includes('track_name=Lucky'))).toHaveLength(1);
    expect(slept).toEqual([]);
  });

  it("fails when LRCLIB's answer for a track is not of the kind it was chosen for, and leaves no file for it", async () => {
    const { failure, left } = await recordInto({
      wake: {
        id: 12,
        name: 'Wake',
        trackName: 'Wake',
        artistName: 'Park',
        albumName: 'Midnight (Deluxe Edition)',
        duration: 101,
        instrumental: false,
        hasWordSync: false,
        plainLyrics: 'a',
        syncedLyrics: '[00:01.00] a',
      },
    });
    expect(String(failure)).toMatch(/the instrumental track's LRCLIB answer is synced/);
    expect(left).not.toContain('lrclib-get-instrumental.json');
    expect(left).toContain('lrclib-get-missing.json');
  });

  it('leaves no file for a Jellyfin answer of the wrong kind', async () => {
    const { failure, left } = await recordInto({ plainLyrics: { Metadata: {}, Lyrics: lines(3) } });
    expect(String(failure)).toMatch(/plain track's Jellyfin lyrics are synced/);
    expect(left).not.toContain('jf-lyrics-plain.json');
  });

  it('fails on a scan finding before writing that recording', async () => {
    const leaky = [{ Text: 'mirror at lyrics.someband.net', Cues: [] }];
    const { failure, left } = await recordInto({ plainLyrics: { Metadata: {}, Lyrics: leaky } });
    expect(String(failure)).toMatch(/jf-lyrics-plain: host at \$\.response\.body\.json\.Lyrics/);
    expect(left).toContain('jf-lyrics-synced.json');
    expect(left).not.toContain('jf-lyrics-plain.json');
  });

  it('fails the run when a name seen while recording is in a recording', async () => {
    const { code, err } = await run({}, FLAGS, ['Rabbit Band']);
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/lyrics-album-2\.json: name at/);
    expect(err.join('\n')).toMatch(/do not commit these recordings/);
  });

  it('takes Jellyfin lines whose Start is null or missing as plain', async () => {
    const plain = [
      { Text: 'one', Start: null, Cues: [] },
      { Text: 'two', Cues: [] },
    ];
    const { code, err, byCall } = await run({ plainLyrics: { Metadata: {}, Lyrics: plain } });
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(json(byCall['jf-lyrics-plain']).Lyrics).toHaveLength(2);
  });

  it('keeps the first failure when logging out fails too, and reports both', async () => {
    const { failure, out } = await recordInto({
      plainLyrics: { Metadata: {}, Lyrics: lines(3) },
      logoutFails: true,
    });
    expect(String(failure)).toMatch(/plain track's Jellyfin lyrics are synced/);
    expect(out.join('\n')).toMatch(/logging out the minted Jellyfin token failed: .*fetch failed/);
  });

  it('fails when logging out fails after everything else went well', async () => {
    const { failure } = await recordInto({ logoutFails: true });
    expect(String(failure)).toMatch(/fetch failed/);
  });

  it('fails before asking anything when an LRCLIB track is not on a recorded album', async () => {
    const argv = FLAGS.map((a) => (a === 'ram,eyr,mtm' ? 'ram,eyr' : a));
    const { code, asked } = await run({}, argv);
    expect(String(code)).toMatch(/wake/);
    expect(asked.filter((a) => a.includes('Lyrics') || a.includes(' lrclib '))).toEqual([]);
  });

  it('refuses to run without the albums and the five tracks', async () => {
    const err: string[] = [];
    const code = await runRecord({
      argv: ['--only', 'lyrics', '--jellyfin', JF, '--lrclib', LRCLIB],
      stdin: 'JELLYFIN_API_KEY=b\n',
      fetch: async () => new Response(null),
      out: () => undefined,
      err: (l) => err.push(l),
    });
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(
      /--albums, --jellyfin-synced, --jellyfin-plain, --lrclib-synced, --lrclib-missing, --lrclib-instrumental/,
    );
  });
});

describe('trimming a lyrics answer for its recording', () => {
  const exchange = (json: unknown): RawExchange => ({
    upstream: 'lrclib',
    upstreamVersion: 'v',
    call: 'c',
    request: { method: 'GET', url: 'https://lrclib.invalid/api/get', headers: {}, body: null },
    response: { status: 200, headers: {}, body: { json } },
  });

  it('leaves a short answer its lines, and still drops lyricsfile and says so', () => {
    const trimmed = trimLyricsExchange(
      exchange({
        id: 1,
        syncedLyrics: '[00:01.00] a\n[00:02.00] b\n',
        plainLyrics: 'a\nb',
        lyricsfile: 'x',
      }),
    );
    expect(trimmed.response.body).toEqual({
      json: {
        id: 1,
        syncedLyrics: '[00:01.00] a\n[00:02.00] b\n',
        plainLyrics: 'a\nb',
        trimmed: LYRICS_TRIMMED,
      },
    });
  });

  it('leaves anything that is not a lyrics answer as it is', () => {
    for (const json of [{ title: 'Not Found', status: 404 }, [1, 2], null]) {
      expect(trimLyricsExchange(exchange(json)).response.body).toEqual({ json });
    }
  });
});

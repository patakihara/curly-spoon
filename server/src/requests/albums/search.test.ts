import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../../adapters/http/replay.js';
import {
  type Clock,
  MusicBrainzClient,
  MUSICBRAINZ_USER_AGENT,
} from '../../adapters/musicbrainz/client.js';
import { ProwlarrClient, type ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import { ALBUM_GROUPS } from '../../adapters/record-musicbrainz.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, type StoredRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, chooseRelease, type RequestJobDeps } from '../job.js';
import {
  type DownloadHandle,
  type MediumSteps,
  type Release,
  StepUnavailable,
  stepsRegistry,
} from '../steps.js';
import { AlbumEditions, targetEdition } from './editions.js';
import { ProwlarrCache } from './prowlarrCache.js';
import {
  type AlbumFacts,
  albumFacts,
  isClear,
  mergeRows,
  rankAlbumRows,
  scoreRows,
  type ScoredRow,
} from './score.js';
import { albumSearch, queryForms } from './search.js';
import { parseTitle } from './titles.js';

const ADAPTERS = join(dirname(fileURLToPath(import.meta.url)), '../../adapters');
const recording = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const BASE = 'http://upstream.invalid';

const MUSICBRAINZ = [
  'rg-slip',
  'releases-slip',
  'rg-ghosts',
  'releases-ghosts',
  'rg-artificial-heart',
  'releases-artificial-heart',
  'rg-gone',
].map((call) => recording('musicbrainz', call));
const PROWLARR = [
  'indexers',
  'music-slip',
  'music-slip-album',
  'music-ghosts',
  'music-nin-discography',
  'music-artificial-heart',
  'music-artificial-heart-album',
  'music-artificial-heart-discography',
  'torrent-ghosts-ia',
  'link-magnet-music',
].map((call) => recording('prowlarr', call));

const { slip, ghosts, artificialHeart, gone } = ALBUM_GROUPS;

const fakeClock = (): Clock & { advance(ms: number): void } => {
  let now = 1_000_000;
  return {
    now: () => now,
    sleep: async (ms) => void (now += ms),
    advance: (ms) => void (now += ms),
  };
};

const musicBrainz = () =>
  new MusicBrainzClient({
    baseUrl: BASE,
    fetch: replayFetch(MUSICBRAINZ),
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: fakeClock(),
  });

/** Every call Prowlarr was asked, as path and query, keys left out. */
interface Asked {
  searches: string[];
  links: string[];
}

function prowlarrOn(fetch: FetchLike, asked: Asked) {
  const counting: FetchLike = (url, init) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === '/api/v1/search') asked.searches.push(searchParams.get('query') ?? '');
    else if (pathname.endsWith('/download')) asked.links.push(searchParams.get('link') ?? '');
    return fetch(url, init);
  };
  return new ProwlarrClient({ baseUrl: BASE, apiKey: '<token>', fetch: counting });
}

const recorded = replayFetch(PROWLARR, { readBytes: standInsBeside(ADAPTERS) });

/** The search step on the recordings, with what it asked of Prowlarr. */
function searchOn(db: Db, fetch: FetchLike = recorded) {
  const asked: Asked = { searches: [], links: [] };
  const clock = fakeClock();
  const prowlarr = new ProwlarrCache({ db, prowlarr: prowlarrOn(fetch, asked), clock });
  const editions = new AlbumEditions({ db, musicBrainz: musicBrainz(), now: clock.now });
  return { search: albumSearch({ db, editions, prowlarr }), asked };
}

const target = (group: string, title = 'a title a client sent'): RequestRef['target'] => ({
  title,
  creator: 'a client',
  ids: { mbid: group },
});
const asking = (group: string) => ({ target: target(group) }) as unknown as StoredRequest;

/** The rows Prowlarr's recordings list for these calls. */
async function rowsOf(...calls: string[]): Promise<ProwlarrRelease[]> {
  const client = new ProwlarrClient({ baseUrl: BASE, apiKey: '<token>', fetch: recorded });
  const rows: ProwlarrRelease[] = [];
  for (const call of calls) {
    const { query } = PROWLARR.find((one) => one.call === call)!.request;
    rows.push(
      ...(await client.search(query.query as string, {
        categories: [3000],
        indexerIds: [Number(query.indexerIds)],
      })),
    );
  }
  return rows;
}

async function factsOf(group: string): Promise<AlbumFacts> {
  const editions = new AlbumEditions({ db: openDatabase(':memory:'), musicBrainz: musicBrainz() });
  const album = (await editions.read(group))!;
  return albumFacts(album.group, album.editions, targetEdition(album.editions)!);
}

const titles = (ranked: readonly ScoredRow[]) => ranked.map((one) => one.row.title);
const at = (ranked: readonly ScoredRow[], title: string) =>
  ranked.findIndex((one) => one.row.title === title);

describe('[M3.albums/a] what a torrent title says', () => {
  it.each([
    ['Nine Inch Nails The Slip Album  24Bit 44 1kHz FLAC Beats⭐', 'flac', 24, 44.1],
    ['Nine Inch Nails - The Slip Vinyl 24/96', 'flac', 24, 96],
    ['Nine Inch Nails   Ghosts I IV (2008) (320) [DJ]', 'mp3-320', null, null],
    ['Nine Inch Nails Discography 1998- 2007 - Mp3 VBR', 'mp3', null, null],
    ['Nine Inch Nails - The Slip - Apple Lossless', 'refused', null, null],
    ['Nine Inch Nails - Ghosts I-IV (256kbps AAC)', 'refused', null, null],
    ['Nine Inch Nails - The Slip.Wave', 'refused', null, null],
    ['Jonathan Coulton - Artificial Heart [2011]', 'unknown', null, null],
  ])('%s reads as %s', (title, format, bitDepth, sampleRate) => {
    expect(parseTitle(title)).toMatchObject({ format, bitDepth, sampleRate });
  });

  it('a discography is a pack, and edition words are read', () => {
    expect(parseTitle('Nine Inch Nails Album Discography [1989-2013] [FLAC]').pack).toBe(true);
    expect(parseTitle('Album (Deluxe Edition 2CD) Remastered').editionWords).toEqual([
      'deluxe',
      '2cd',
      'remaster',
    ]);
  });
});

describe('[M3.albums/a] ranking an album’s releases, on Prowlarr recordings', () => {
  let slipFacts: AlbumFacts;
  let ghostsFacts: AlbumFacts;
  beforeEach(async () => {
    slipFacts = await factsOf(slip.group);
    ghostsFacts = await factsOf(ghosts.group);
  });

  it('[M3.albums/a] FLAC ranks over MP3 320, and MP3 320 over other MP3', async () => {
    const ranked = rankAlbumRows(
      (await rowsOf('music-ghosts', 'music-nin-discography')).map((release) => ({ release })),
      ghostsFacts,
    );
    const formats = ranked.map((one) => one.facts.format);
    const last = (format: string) => formats.lastIndexOf(format as never);
    const first = (format: string) => formats.indexOf(format as never);
    expect(last('flac')).toBeLessThan(first('mp3-320'));
    expect(last('mp3-320')).toBeLessThan(first('mp3'));
    expect(last('mp3')).toBeLessThan(first('unknown'));
  });

  it('[M3.albums/a] a file list that fits ranks over a file count that could, and that over neither', async () => {
    const rows = await rowsOf('music-slip');
    const proved = 'Nine Inch Nails - The Slip -Flac';
    const files = slipFacts.target.tracks.map((track, i) => ({
      path: `NIN - The Slip/${String(i + 1).padStart(2, '0')} - ${track.title}.flac`,
      size: 27_000_000,
    }));
    const ranked = rankAlbumRows(
      rows.map((release) => (release.title === proved ? { release, files } : { release })),
      slipFacts,
    );
    const flac = ranked.filter((one) => one.facts.format === 'flac');
    expect(flac[0]).toMatchObject({ fit: 'proved', row: { title: proved } });
    expect(flac.map((one) => one.fit)).toEqual(
      [...flac.map((one) => one.fit)].sort(
        (a, b) =>
          ['proved', 'counted', 'unknown'].indexOf(a) - ['proved', 'counted', 'unknown'].indexOf(b),
      ),
    );
    expect(flac.some((one) => one.fit === 'counted')).toBe(true);
    expect(flac.some((one) => one.fit === 'unknown')).toBe(true);
  });

  it('[M3.albums/a] a sensible size ranks over one three times the expected, alive over dead', async () => {
    const ranked = rankAlbumRows(
      (await rowsOf('music-slip')).map((release) => ({ release })),
      slipFacts,
    );
    const counted = ranked.filter((one) => one.facts.format === 'flac' && one.fit === 'counted');
    expect(titles(counted)).toEqual([
      'Nine Inch Nails The Slip Album  24Bit 44 1kHz FLAC Beats⭐',
      'Nine Inch Nails - The Slip -Flac',
      'Nine Inch Nails - The Slip Vinyl 24/96',
    ]);
    const [alive, lessAlive, tooLarge] = counted as [ScoredRow, ScoredRow, ScoredRow];
    expect([alive.sensible, alive.alive]).toEqual([true, 0]);
    expect([lessAlive.sensible, lessAlive.alive]).toEqual([true, 1]);
    expect(tooLarge.sensible).toBe(false);
    expect(tooLarge.row.size! / alive.row.size!).toBeGreaterThan(1.9);
  });

  it('[M3.albums/a] a pack ranks below every single album of its format and fit', async () => {
    const ranked = rankAlbumRows(
      (await rowsOf('music-ghosts', 'music-nin-discography')).map((release) => ({ release })),
      ghostsFacts,
    );
    for (const format of ['flac', 'mp3-320'] as const) {
      const same = ranked.filter((one) => one.facts.format === format && one.fit === 'unknown');
      const firstPack = same.findIndex((one) => one.facts.pack);
      expect(firstPack, format).toBeGreaterThan(0);
      expect(
        same.slice(firstPack).every((one) => one.facts.pack),
        format,
      ).toBe(true);
    }
    expect(ranked.some((one) => one.facts.pack && isClear(one))).toBe(false);
  });

  it('[M3.albums/a] what is not the album in a format Auralis tags is never offered', async () => {
    const offered = titles(
      rankAlbumRows(
        (await rowsOf('music-slip', 'music-ghosts')).map((release) => ({ release })),
        slipFacts,
      ),
    ).concat(
      titles(
        rankAlbumRows(
          (await rowsOf('music-ghosts')).map((release) => ({ release })),
          ghostsFacts,
        ),
      ),
    );
    for (const never of [
      /Apple Lossless/,
      /\.Wave/,
      /DVD-A/,
      /Bonus_DVD/,
      /Rehearsal DVD/,
      /stems/,
      /AAC/,
      /M4A/,
      /5\.1/,
      /Instrumental/,
      /\[ZIP\]/,
      /full cd/,
    ]) {
      expect(offered.filter((title) => never.test(title))).toEqual([]);
    }
    expect(
      at(
        rankAlbumRows(
          (await rowsOf('music-slip')).map((release) => ({ release })),
          slipFacts,
        ),
        'NIN - The Slip -FLAC',
      ),
    ).toBe(-1);
  });

  it('[M3.albums/a] the same torrent on several indexers is one row, with the most seeders', async () => {
    const merged = mergeRows((await rowsOf('music-ghosts')).map((release) => ({ release })));
    const one = merged.filter((row) => row.title.endsWith('2008 320kbps And Extras'));
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ seeders: 31, fileCount: 132 });
    expect(one[0]!.sources).toHaveLength(2);
  });

  it('[M3.albums/a] rows of one torrent with no hash merge by their words and a size within 0.5%', async () => {
    const merged = mergeRows((await rowsOf('music-slip')).map((release) => ({ release })));
    const beats = merged.filter((row) => /24Bit 44 1kHz FLAC Beats/.test(row.title));
    expect(beats).toHaveLength(1);
    expect(beats[0]).toMatchObject({ seeders: 40, fileCount: 11 });
    expect(beats[0]!.sources).toHaveLength(4);
  });

  it('[M3.albums/a] a file list that fits no edition is never offered', async () => {
    const rows = (await rowsOf('music-slip')).filter((one) => one.title.endsWith('-Flac'));
    const scored = scoreRows(
      mergeRows(
        rows.map((release) => ({
          release,
          files: [{ path: 'debian/debian-13.iso', size: 700_000_000 }],
        })),
      ),
      slipFacts,
    );
    expect(scored.map((one) => one.rejected)).toEqual(['its files fit no edition']);
  });
});

describe('[M3.albums/a] the search step runs the query forms one a turn', () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('[M3.albums/a] the forms are the artist with the album, the album alone, and the discography', () => {
    const credit = [{ name: 'Nine Inch Nails', joinPhrase: '', artistId: 'nin' }];
    expect(queryForms({ title: 'Ghosts I–IV', artistCredit: credit })).toEqual([
      'Nine Inch Nails Ghosts I-IV',
      'Ghosts I-IV',
      'Nine Inch Nails discography',
    ]);
    expect(queryForms({ title: 'Discovery', artistCredit: credit })).toEqual([
      'Nine Inch Nails Discovery',
      'Nine Inch Nails discography',
    ]);
    const various = [
      { name: 'Various Artists', joinPhrase: '', artistId: '89ad4ac3-39f7-470e-963a-56509c546377' },
    ];
    expect(queryForms({ title: 'Pulp (Deluxe)', artistCredit: various })).toEqual([
      'Various Artists Pulp',
      'Pulp',
    ]);
  });

  it('[M3.albums/a] The Slip picks the 24-bit FLAC after one query, and asks no more', async () => {
    const { search, asked } = searchOn(db);
    const found = await search(asking(slip.group));
    if (found.kind !== 'picked') throw new Error(`expected a pick, not ${found.kind}`);
    expect(found.release.title).toBe('Nine Inch Nails The Slip Album  24Bit 44 1kHz FLAC Beats⭐');
    expect(found.release.details).toMatchObject({ format: 'flac', fit: 'counted' });
    expect(found.others.map((one) => one.title)).toEqual(['Nine Inch Nails - The Slip -Flac']);
    expect(asked).toEqual({ searches: ['Nine Inch Nails The Slip'], links: [] });
  });

  it("[M3.albums/a] Ghosts I–IV waits a turn for its links, then is clear through the Internet Archive's file list", async () => {
    const { search, asked } = searchOn(db);
    expect(await search(asking(ghosts.group))).toEqual({ kind: 'waiting' });
    expect(asked).toEqual({ searches: ['Nine Inch Nails Ghosts I-IV'], links: [] });
    const found = await search(asking(ghosts.group));
    if (found.kind !== 'picked') throw new Error(`expected a pick, not ${found.kind}`);
    expect(found.release.title).toBe(
      'Nine Inch Nails: Ghosts I-IV (2008) [FLAC; Source: Official Download]',
    );
    expect(found.release.details).toMatchObject({
      format: 'flac',
      fit: 'proved',
      infoHash: '802668fa8d65fca85b7fa3335e5723a3543d4778',
    });
    expect(asked.searches).toEqual(['Nine Inch Nails Ghosts I-IV']);
    expect(asked.links).toHaveLength(3);
    expect(asked.links).toContain('link-723c0f17e972');
    expect(JSON.stringify(found)).not.toMatch(/apikey|<token>|https?:/);
  });

  it('[M3.albums/a] a third look asks nothing: every answer was kept', async () => {
    const { search, asked } = searchOn(db);
    await search(asking(ghosts.group));
    await search(asking(ghosts.group));
    const before = { searches: [...asked.searches], links: [...asked.links] };
    await search(asking(ghosts.group));
    expect(asked).toEqual(before);
  });

  it('[M3.albums/a] Artificial Heart runs all three forms, one a turn, waiting until the last', async () => {
    const { search, asked } = searchOn(db);
    const answers: string[] = [];
    const perTurn: number[] = [];
    for (let turn = 0; turn < 3; turn += 1) {
      const before = asked.searches.length;
      answers.push((await search(asking(artificialHeart.group))).kind);
      perTurn.push(asked.searches.length - before);
    }
    expect(answers).toEqual(['waiting', 'waiting', 'choose']);
    expect(perTurn).toEqual([1, 1, 1]);
    expect(asked.searches).toEqual([
      'Jonathan Coulton Artificial Heart',
      'Artificial Heart',
      'Jonathan Coulton discography',
    ]);
  });

  it('[M3.albums/b] Artificial Heart then answers a choice with its MP3-sized row, lossy and packs included', async () => {
    const { search } = searchOn(db);
    let found = await search(asking(artificialHeart.group));
    while (found.kind === 'waiting') found = await search(asking(artificialHeart.group));
    if (found.kind !== 'choose') throw new Error(`expected a choice, not ${found.kind}`);
    const offered = found.candidates.map((one) => one.title);
    expect(offered).toContain('Jonathan Coulton - Artificial Heart [2011] (format not named)');
    expect(found.candidates.length).toBeLessThanOrEqual(10);
    expect(found.candidates.some((one) => one.details.pack === true)).toBe(true);
    expect(new Set(found.candidates.map((one) => one.id)).size).toBe(found.candidates.length);
  });

  it('[M3.albums/a] a client’s title is never sent: the queries come from MusicBrainz’s names', async () => {
    const { search, asked } = searchOn(db);
    await search({
      target: target(slip.group, 'Something Else Entirely'),
    } as unknown as StoredRequest);
    expect(asked.searches.join(' ')).not.toMatch(/something else|a client/i);
  });

  it('[M3.albums/a] no row at all, or a group that is gone, is no release', async () => {
    const empty: FetchLike = async (url, init) =>
      new URL(url).pathname === '/api/v1/search'
        ? new Response('[]', { headers: { 'content-type': 'application/json' } })
        : recorded(url, init);
    const { search } = searchOn(db, empty);
    let found = await search(asking(slip.group));
    while (found.kind === 'waiting') found = await search(asking(slip.group));
    expect(found).toEqual({ kind: 'none', reason: 'noRelease' });
    expect(await searchOn(openDatabase(':memory:')).search(asking(gone.group))).toEqual({
      kind: 'none',
      reason: 'noRelease',
    });
  });

  it('[M3.albums/a] Prowlarr down holds the request, and keeps nothing', async () => {
    const down: FetchLike = async (url, init) =>
      new URL(url).pathname === '/api/v1/search'
        ? new Response('', { status: 503 })
        : recorded(url, init);
    const { search } = searchOn(db, down);
    await expect(search(asking(slip.group))).rejects.toBeInstanceOf(StepUnavailable);
    expect(db.prepare('SELECT COUNT(*) AS n FROM prowlarr_searches').get()).toEqual({ n: 0 });
  });
});

describe('[M3.albums/b] an unclear album waits for a person’s choice', () => {
  it('[M3.albums/b] the job puts Artificial Heart in needsChoice, starts nothing, and a choice starts it', async () => {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'someone', role: 'member' });
    const { search } = searchOn(db);
    const start = vi.fn(
      async (_request: StoredRequest, release: Release, key: string): Promise<DownloadHandle> => ({
        hash: release.id,
        key,
      }),
    );
    const steps: MediumSteps = {
      medium: 'album',
      search,
      download: {
        start,
        poll: async () => ({ kind: 'queued' }),
        cancel: async () => undefined,
      },
      import: async () => ({ kind: 'waiting' }),
    };
    let clock = 0;
    const job: RequestJobDeps = {
      db,
      steps: stepsRegistry([steps]),
      log: { error: () => undefined },
      now: () => clock,
      notIndexedAfterMs: 60 * 60_000,
      stepTimeoutMs: 10_000,
      stallAfterMs: 10 * 60_000,
      holdAfterMs: 60 * 60_000,
    };
    const { request } = createRequest(
      db,
      user.id,
      { medium: 'album', target: target(artificialHeart.group) },
      clock,
    );
    for (
      let turn = 0;
      turn < 6 && getRequest(db, request.id)!.state.status !== 'needsChoice';
      turn += 1
    ) {
      await advanceRequests(job);
      clock += 60_000;
    }
    const waiting = getRequest(db, request.id)!;
    expect(waiting.state.status).toBe('needsChoice');
    expect(start).not.toHaveBeenCalled();
    const mp3 = waiting.candidates.find((one) =>
      one.title.startsWith('Jonathan Coulton - Artificial Heart [2011]'),
    );
    expect(mp3).toBeDefined();

    chooseRelease(job, request.id, mp3!.id);
    await advanceRequests(job);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]![1]).toEqual(mp3);
  });
});

/**
 * An album's torrent download and its gate, through the real job, store, qBittorrent client and
 * album editions. qBittorrent is a stand-in that keeps its torrents as recorded rows and files
 * (`info-metadata`'s row, `album-files`' file), answers each call as the recordings do, and does what
 * the API says a call does. The add, start and tag answers are a live album request's
 * (`album-add-stop`, `album-start`, `album-add-tag`); in that run qBittorrent's own log said the
 * torrent stopped four seconds after the add and resumed at the gate's start. Every gate test also
 * runs with the stop ignored, a qBittorrent that would not honour it: the gate then acts at the
 * first poll that lists files, having fetched a few seconds of bytes.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestRef } from '@auralis/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../../adapters/http/recording.js';
import { replayFetch } from '../../adapters/http/replay.js';
import { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { ProwlarrClient } from '../../adapters/prowlarr/client.js';
import { ALBUM_GROUPS } from '../../adapters/record-musicbrainz.js';
import { openDatabase, type Db } from '../../store/connection.js';
import { createRequest, getRequest, type StoredRequest } from '../../store/requests.js';
import { upsertUser } from '../../store/users.js';
import { advanceRequests, type RequestJobDeps } from '../job.js';
import { type DownloadHandle, type Release, StepUnavailable, stepsRegistry } from '../steps.js';
import type { TorrentFile } from '../download/torrentFiles.js';
import { albumDownload, FIT_TAG, MUSIC_CATEGORY } from './download.js';
import type { AlbumEditions, Edition } from './editions.js';
import { ghostsFiles, nineInchNailsPack, PACK, recordedAlbumEditions } from './fixtures/albums.js';

const QBIT = join(dirname(fileURLToPath(import.meta.url)), '../../adapters/qbittorrent/recordings');
const recorded = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(QBIT, `${call}.json`), 'utf8')));
const jsonOf = (call: string) =>
  (recorded(call).response.body as { json: Record<string, unknown>[] }).json;

const DEBIAN = recorded('info-done').request.query.hashes as string;
const GHOSTS = 'a'.repeat(40);
const PACKED = 'b'.repeat(40);
const ANOTHER = 'c'.repeat(40);
const MINUTE = 60_000;
const STALL = 15 * MINUTE;

/** Debian's installer as recorded: the files of a release that is not the album. */
const debianFiles = (): TorrentFile[] =>
  jsonOf('files').map((file) => ({ path: file.name as string, size: file.size as number }));

interface Torrent {
  row: Record<string, unknown>;
  files: TorrentFile[] | null;
  priorities: Map<number, number>;
  stopAtMetadata: boolean;
}

/**
 * qBittorrent as the recordings answer it. `honoursStop: false` is a qBittorrent that ignores the
 * metadata stop. `failStartOnce` makes the next start unreachable, as a lost answer.
 */
function qbittorrentStandIn(opts: { honoursStop?: boolean } = {}) {
  const torrents = new Map<string, Torrent>();
  const asked: { path: string; form: URLSearchParams }[] = [];
  let failStart = false;
  /** The recorded answer to `call`, given to this request, which may be another call's. */
  const answer = (call: string, url: URL, init?: RequestInit) => {
    const one = recorded(call);
    const query = Object.fromEntries(url.searchParams);
    const request = { ...one.request, path: url.pathname, query };
    return replayFetch([{ ...one, request }])(url.toString(), init);
  };
  const rows = (json: unknown[]) => {
    const one = recorded('info-metadata');
    const body = { json };
    return { ...one, response: { ...one.response, body } };
  };
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const path = url.pathname.replace('/api/v2/', '');
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    asked.push({ path, form });
    const hashes = (form.get('hashes') ?? url.searchParams.get('hashes') ?? '').split('|');
    switch (path) {
      case 'torrents/info': {
        const found = hashes.flatMap((hash) => {
          const there = torrents.get(hash);
          return there === undefined ? [] : [there.row];
        });
        const one = rows(found);
        const query = Object.fromEntries(url.searchParams);
        return replayFetch([{ ...one, request: { ...one.request, query } }])(input, init);
      }
      case 'torrents/createCategory':
        return answer('create-category', url, init);
      case 'torrents/add': {
        const hash = (form.get('urls') ?? '').slice(-40);
        if (torrents.has(hash)) return answer('add-existing', url, init);
        const [template] = jsonOf('info-metadata');
        torrents.set(hash, {
          row: { ...template, hash, category: form.get('category'), tags: form.get('tags') },
          files: null,
          priorities: new Map(),
          stopAtMetadata: form.get('stopCondition') === 'MetadataReceived',
        });
        return answer('album-add-stop', url, init);
      }
      case 'torrents/files': {
        const there = torrents.get(url.searchParams.get('hash') ?? '');
        const [template] = jsonOf('album-files');
        const json = (there?.files ?? []).map((file, index) => ({
          ...template,
          index,
          name: file.path,
          size: file.size,
          priority: there?.priorities.get(index) ?? 1,
          progress: 0,
        }));
        const one = recorded('album-files');
        const query = Object.fromEntries(url.searchParams);
        return replayFetch([
          {
            ...one,
            request: { ...one.request, query },
            response: { ...one.response, body: { json } },
          },
        ])(input, init);
      }
      case 'torrents/filePrio': {
        const there = torrents.get(form.get('hash') ?? '');
        if (there === undefined) return answer('file-prio-missing', url, init);
        for (const id of (form.get('id') ?? '').split('|')) {
          there.priorities.set(Number(id), Number(form.get('priority')));
        }
        return answer('add-tag-missing', url, init);
      }
      case 'torrents/start': {
        if (failStart) {
          failStart = false;
          throw new TypeError('fetch failed');
        }
        for (const hash of hashes) {
          const there = torrents.get(hash);
          if (there?.row.state === 'stoppedDL') there.row.state = 'downloading';
        }
        return answer(
          hashes.some((hash) => torrents.has(hash)) ? 'album-start' : 'start-missing',
          url,
          init,
        );
      }
      case 'torrents/addTags': {
        for (const hash of hashes) {
          const there = torrents.get(hash);
          if (there === undefined) continue;
          const tags = String(there.row.tags).split(/,\s*/).filter(Boolean);
          if (!tags.includes(form.get('tags') ?? '')) tags.push(form.get('tags') ?? '');
          there.row.tags = tags.join(', ');
        }
        return answer(
          hashes.some((hash) => torrents.has(hash)) ? 'album-add-tag' : 'add-tag-missing',
          url,
          init,
        );
      }
      case 'torrents/delete':
        for (const hash of hashes) torrents.delete(hash);
        return answer('delete', url, init);
      default:
        throw new Error(`no stand-in for ${path}`);
    }
  };
  return {
    qbittorrent: new QbittorrentClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: '<token>',
      fetch,
    }),
    torrents,
    asked,
    paths: () => asked.map((one) => one.path),
    failNextStart: () => void (failStart = true),
    /** The torrent's metadata comes in: stopped there if the add asked and the stop is honoured. */
    metadata(hash: string, files: TorrentFile[]) {
      const there = torrents.get(hash)!;
      there.files = files;
      const stops = there.stopAtMetadata && opts.honoursStop !== false;
      there.row = {
        ...there.row,
        state: stops ? 'stoppedDL' : 'downloading',
        progress: stops ? 0 : 0.002,
      };
    },
    /** A torrent the household added itself, in its own category. */
    household(hash: string, files: TorrentFile[]) {
      const [template] = jsonOf('album-info-downloading');
      torrents.set(hash, {
        row: { ...template, hash, category: 'a-household-category', tags: '' },
        files,
        priorities: new Map(),
        stopAtMetadata: false,
      });
    },
  };
}

const noProwlarr: Pick<ProwlarrClient, 'resolve'> = {
  resolve: async (details) => {
    const hash = (details.magnet as string).slice(-40);
    return { kind: 'magnet', magnet: details.magnet as string, hash };
  },
};

const release = (hash: string, pack = false): Release => ({
  id: `release-${hash.slice(0, 8)}`,
  title: 'Nine Inch Nails - Ghosts I-IV [FLAC]',
  source: 'an indexer',
  size: null,
  details: { magnet: `magnet:?xt=urn:btih:${hash}`, format: 'flac', fit: 'counted', pack },
});

const ghostsRef: RequestRef = {
  medium: 'album',
  target: {
    title: 'Ghosts I–IV',
    creator: 'Nine Inch Nails',
    ids: { mbid: ALBUM_GROUPS.ghosts.group },
  },
};

let db: Db;
let clock: number;
let person: string;
let editions: AlbumEditions;
let slip: Edition;

beforeEach(async () => {
  db = openDatabase(':memory:');
  clock = Date.UTC(2026, 10, 10, 8);
  person = upsertUser(db, { username: 'ana', role: 'member' }).id;
  editions = recordedAlbumEditions(db);
  slip = (await editions.read(ALBUM_GROUPS.slip.group))!.editions[0]!;
});

const steps = (sim: ReturnType<typeof qbittorrentStandIn>) =>
  albumDownload({ qbittorrent: sim.qbittorrent, prowlarr: noProwlarr, editions, now: () => clock });

/** The job with album steps whose search picks `picked`, then `others`. */
const job = (sim: ReturnType<typeof qbittorrentStandIn>, picked: Release, others: Release[] = []) =>
  ({
    db,
    steps: stepsRegistry([
      {
        medium: 'album',
        search: async () => ({ kind: 'picked', release: picked, others }),
        download: steps(sim),
        import: async () => ({ kind: 'waiting' }),
      },
    ]),
    log: { error: () => undefined },
    now: () => clock,
    notIndexedAfterMs: 24 * 60 * MINUTE,
    stepTimeoutMs: MINUTE,
    stallAfterMs: STALL,
    holdAfterMs: 60 * MINUTE,
  }) satisfies RequestJobDeps;

const turn = async (deps: RequestJobDeps, by = 1_000) => {
  clock += by;
  await advanceRequests(deps);
};
const reread = (one: StoredRequest) => getRequest(db, one.id) as StoredRequest;

/** Turns until the request holds a download handle. */
async function started(deps: RequestJobDeps, one: StoredRequest) {
  for (let at = 0; at < 5 && reread(one).handle === null; at += 1) await turn(deps);
  expect(reread(one).handle).not.toBeNull();
}

const GATE_CALLS = ['torrents/files', 'torrents/filePrio', 'torrents/start', 'torrents/addTags'];

describe.each([
  ['stopped at its metadata', true],
  ['with the metadata stop ignored', false],
])('[M3.albums] the gate, a torrent %s', (_, honoursStop) => {
  it('[M3.albums] the album’s files pass: the torrent starts, is tagged fit, and the next poll is downloading', async () => {
    const sim = qbittorrentStandIn({ honoursStop });
    const deps = job(sim, release(GHOSTS));
    const one = createRequest(db, person, ghostsRef, clock).request;
    await started(deps, one);

    const add = sim.asked.find((call) => call.path === 'torrents/add')?.form;
    expect(add?.get('stopCondition')).toBe('MetadataReceived');
    expect(add?.get('category')).toBe(MUSIC_CATEGORY);

    await turn(deps);
    expect(reread(one).state).toMatchObject({ status: 'downloading', progress: 0 });
    expect(sim.paths().filter((path) => path !== 'torrents/files')).not.toContain('torrents/start');

    sim.metadata(GHOSTS, ghostsFiles());
    await turn(deps);
    expect(sim.paths()).toContain('torrents/start');
    expect(sim.paths()).not.toContain('torrents/filePrio');
    expect(sim.torrents.get(GHOSTS)?.row.tags).toContain(FIT_TAG);
    expect(sim.torrents.get(GHOSTS)?.row.state).toBe('downloading');
    expect(reread(one).state.status).toBe('downloading');

    const before = sim.asked.length;
    await turn(deps);
    expect(reread(one).state.status).toBe('downloading');
    expect(sim.paths().slice(before)).toEqual(['torrents/info']);
  });

  it('[M3.albums] files that are not the album fail wrongRelease, drop the torrent and start the next', async () => {
    const sim = qbittorrentStandIn({ honoursStop });
    const deps = job(sim, release(DEBIAN), [release(GHOSTS)]);
    const one = createRequest(db, person, ghostsRef, clock).request;
    await started(deps, one);
    sim.metadata(DEBIAN, debianFiles());
    await turn(deps);
    expect(reread(one).state.status).toBe('queued');
    expect(reread(one).autoStarts).toBe(1);
    for (let at = 0; at < 3; at += 1) await turn(deps);

    expect(sim.paths()).not.toContain('torrents/start');
    expect(sim.torrents.has(DEBIAN)).toBe(false);
    expect(sim.torrents.has(GHOSTS)).toBe(true);
    expect(reread(one).handle).toMatchObject({ hash: GHOSTS });
  });

  it('[M3.albums] a pack fetches only the album’s folder: every file outside it at priority 0', async () => {
    const sim = qbittorrentStandIn({ honoursStop });
    const deps = job(sim, release(PACKED, true));
    const one = createRequest(db, person, ghostsRef, clock).request;
    await started(deps, one);
    const files = nineInchNailsPack(slip);
    sim.metadata(PACKED, files);
    await turn(deps);

    const prio = sim.asked.find((call) => call.path === 'torrents/filePrio')?.form;
    expect(prio?.get('priority')).toBe('0');
    const skipped = new Set(prio?.get('id')?.split('|').map(Number));
    const outside = files.flatMap((file, index) =>
      file.path.startsWith(`${PACK}/2008 - Ghosts I-IV/`) ? [] : [index],
    );
    expect([...skipped].sort((a, b) => a - b)).toEqual(outside);
    expect(sim.paths().indexOf('torrents/filePrio')).toBeLessThan(
      sim.paths().indexOf('torrents/start'),
    );
    expect(sim.torrents.get(PACKED)?.row.tags).toContain(FIT_TAG);
    expect(reread(one).state.status).toBe('downloading');
  });

  it('[M3.albums] a pack with no folder that is the album fails wrongRelease', async () => {
    const sim = qbittorrentStandIn({ honoursStop });
    const deps = job(sim, release(PACKED, true));
    const one = createRequest(db, person, ghostsRef, clock).request;
    await started(deps, one);
    sim.metadata(
      PACKED,
      nineInchNailsPack(slip).filter((file) => !file.path.includes('Ghosts')),
    );
    await turn(deps);
    expect(reread(one).state).toMatchObject({ status: 'failed', reason: 'wrongRelease' });
    expect(sim.paths()).not.toContain('torrents/start');
  });
});

describe('[M3.albums] the gate’s edges', () => {
  /** A started download of `hash`, its handle and the stand-in. */
  async function startedDirect(hash: string, opts: { pack?: boolean } = {}) {
    const sim = qbittorrentStandIn();
    const download = steps(sim);
    const request = { target: ghostsRef.target } as StoredRequest;
    const handle = await download.start(request, release(hash, opts.pack), 'a-key');
    return { sim, download, handle };
  }

  it('[M3.albums] a torrent whose metadata never comes is never gated and stalls as books do', async () => {
    const sim = qbittorrentStandIn();
    const deps = job(sim, release(GHOSTS));
    const one = createRequest(db, person, ghostsRef, clock).request;
    await started(deps, one);
    await turn(deps);
    expect(reread(one).state).toMatchObject({ status: 'downloading', progress: 0 });
    await turn(deps, STALL - MINUTE);
    expect(reread(one).state.status).toBe('downloading');
    await turn(deps, MINUTE);
    expect(reread(one).state).toMatchObject({ status: 'failed', reason: 'downloadStalled' });
    expect(sim.paths()).not.toContain('torrents/start');
  });

  it('[M3.albums] a torrent tagged fit is never gated again', async () => {
    const { sim, download, handle } = await startedDirect(GHOSTS);
    sim.metadata(GHOSTS, ghostsFiles());
    await download.poll(handle);
    const before = sim.asked.length;
    sim.torrents.get(GHOSTS)!.files = debianFiles();
    expect(await download.poll(handle)).toMatchObject({ kind: 'downloading' });
    expect(sim.paths().slice(before)).toEqual(['torrents/info']);
  });

  it('[M3.albums] a start lost after the gate holds the request, and the next poll repeats it harmlessly', async () => {
    const { sim, download, handle } = await startedDirect(PACKED, { pack: true });
    const files = nineInchNailsPack(slip);
    sim.metadata(PACKED, files);
    sim.failNextStart();
    await expect(download.poll(handle)).rejects.toBeInstanceOf(StepUnavailable);
    expect(sim.torrents.get(PACKED)?.row.tags).not.toContain(FIT_TAG);

    expect(await download.poll(handle)).toMatchObject({ kind: 'downloading' });
    const torrent = sim.torrents.get(PACKED)!;
    expect(torrent.row.state).toBe('downloading');
    expect(torrent.row.tags).toContain(FIT_TAG);
    const kept = files.flatMap((file, index) =>
      file.path.startsWith(`${PACK}/2008 - Ghosts I-IV/`) ? [index] : [],
    );
    for (const index of kept) expect(torrent.priorities.get(index) ?? 1).toBe(1);
    expect(torrent.priorities.size).toBe(files.length - kept.length);
  });

  it('[M3.albums] a torrent of the household is followed, never gated, and its cancel deletes nothing', async () => {
    const sim = qbittorrentStandIn();
    sim.household(ANOTHER, debianFiles());
    const download = steps(sim);
    const request = { target: ghostsRef.target } as StoredRequest;
    const handle = await download.start(request, release(ANOTHER), 'a-key');
    expect(await download.poll(handle)).toMatchObject({ kind: 'downloading' });
    await download.cancel({ handle });
    expect(
      sim.paths().filter((path) => GATE_CALLS.includes(path) || path.endsWith('delete')),
    ).toEqual([]);
    expect(sim.torrents.has(ANOTHER)).toBe(true);
  });

  it('[M3.albums] a cancel keeps the books rule: our category and our key, fit or not', async () => {
    const { sim, download, handle } = await startedDirect(GHOSTS);
    sim.metadata(GHOSTS, ghostsFiles());
    await download.poll(handle);
    await download.cancel({ handle });
    expect(sim.torrents.has(GHOSTS)).toBe(false);

    const other = await startedDirect(DEBIAN);
    other.sim.torrents.get(DEBIAN)!.row.category = 'a-household-category';
    await other.download.cancel({ handle: other.handle });
    expect(other.sim.torrents.has(DEBIAN)).toBe(true);
  });

  it('[M3.albums] the handle names the release group and whether the release is a pack', async () => {
    const { handle } = await startedDirect(PACKED, { pack: true });
    expect(handle).toMatchObject({
      hash: PACKED,
      key: 'a-key',
      releaseGroupId: ALBUM_GROUPS.ghosts.group,
      pack: true,
    } satisfies Partial<DownloadHandle>);
  });

  it('[M3.albums] a group MusicBrainz no longer has fails wrongRelease rather than guess', async () => {
    const sim = qbittorrentStandIn();
    const download = steps(sim);
    const request = {
      target: { ...ghostsRef.target, ids: { mbid: ALBUM_GROUPS.gone.group } },
    } as StoredRequest;
    const handle = await download.start(request, release(GHOSTS), 'a-key');
    sim.metadata(GHOSTS, ghostsFiles());
    const gone: Pick<AlbumEditions, 'read'> = { read: async () => null };
    const goneDownload = albumDownload({
      qbittorrent: sim.qbittorrent,
      prowlarr: noProwlarr,
      editions: gone,
      now: () => clock,
    });
    expect(await goneDownload.poll(handle)).toEqual({ kind: 'failed', reason: 'wrongRelease' });
    expect(sim.paths()).not.toContain('torrents/start');
  });
});

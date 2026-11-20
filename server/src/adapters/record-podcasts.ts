/**
 * Record mode's podcast parts, for M3.podcasts.
 *
 * `itunes` (no key, no account, from this machine): iTunes' podcast search, through the client's
 * own queue, with a further 3 s pause before each call: a known show by name
 * (`search-maintenance-phase`), a broad word that lists rows without a feed (`search-history`),
 * and words nothing matches (`search-none`). Each answer is cut to the fields the client parses;
 * it is a public catalogue, so nothing else is scrubbed. Each answer is scanned before it is
 * written, and checked to be what it was asked for.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { AbsClient } from './audiobookshelf/client.js';
import { AbsProvisioner, newPodcastMetadata } from './audiobookshelf/provision.js';
import { parseFeed, readFeed } from './feed/client.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { trimFeedExchange } from './record-sessions.js';
import { type RawExchange } from './http/scrub.js';
import { type Clock, ItunesClient } from './itunes/client.js';
import { PODCAST_SCHEDULE, podcastFolderName } from '../requests/podcasts/place.js';
import { episodeFilenames } from '../stubs/filename.js';
import { DEFAULT_PREFIX, type RangeAnswer, writeStub } from '../stubs/format.js';
import { oldestFirst } from '../stubs/job.js';

/** iTunes names no version of its search; the recording names the route it read. */
export const ITUNES_VERSION = 'iTunes Search API, media=podcast entity=podcast';

/** The pause before each call, on top of the client's own 1 s. */
export const ITUNES_RECORD_GAP_MS = 3_000;

/** The searches recorded, each with what its answer must hold. */
export const ITUNES_SEARCHES = {
  'search-maintenance-phase': { words: 'maintenance phase', title: 'Maintenance Phase' },
  'search-history': { words: 'history', withoutFeed: true },
  'search-none': { words: 'zqxv plorb wendigast', none: true },
} as const;

/** What a row keeps: the fields the schema reads. */
const ROW_FIELDS = [
  'collectionId',
  'collectionName',
  'artistName',
  'feedUrl',
  'trackCount',
  'artworkUrl600',
];

/** The hook: each row cut to `ROW_FIELDS`, the answer kept as the text Apple sent. */
export function rowsCut(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('text' in body || 'json' in body)) return raw;
  const answer = ('text' in body ? JSON.parse(body.text) : body.json) as {
    resultCount?: unknown;
    results?: unknown[];
  } | null;
  if (answer === null || !Array.isArray(answer.results)) return raw;
  const results = answer.results.map((row) =>
    Object.fromEntries(
      Object.entries(row as Record<string, unknown>).filter(([key]) => ROW_FIELDS.includes(key)),
    ),
  );
  const cut = { resultCount: answer.resultCount, results };
  const kept = 'text' in body ? { text: JSON.stringify(cut) } : { json: cut };
  return { ...raw, response: { ...raw.response, body: kept } };
}

function check(ok: boolean, what: string) {
  if (!ok) throw new Error(what);
}

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

/** The raw rows a recording holds, for the checks. */
function rawRows(recording: Recording): Record<string, unknown>[] {
  const body = recording.response.body;
  if (body === null || 'bytes' in body) return [];
  const answer = ('text' in body ? JSON.parse(body.text) : body.json) as { results?: unknown[] };
  return (answer.results ?? []) as Record<string, unknown>[];
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ItunesRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  itunesUrl: string;
  clock?: Clock;
}

export async function recordItunes(input: ItunesRecordInput): Promise<{ written: string[] }> {
  const clock = input.clock ?? realClock;
  const dir = join(input.root, 'itunes', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'itunes',
    upstreamVersion: ITUNES_VERSION,
    secrets: [],
    baseUrl: input.itunesUrl,
    prepare: rowsCut,
  });
  const itunes = new ItunesClient({ baseUrl: input.itunesUrl, fetch: rec.fetch, clock });
  const written: string[] = [];
  for (const [call, search] of Object.entries(ITUNES_SEARCHES)) {
    await clock.sleep(ITUNES_RECORD_GAP_MS);
    const shows = await rec.capture(call, () => itunes.searchShows(search.words), {
      verify: (found, recording) => {
        const rows = rawRows(recording);
        if ('title' in search) {
          check(
            found.some((show) => show.title === search.title),
            `${call}: no ${search.title}`,
          );
        }
        if ('withoutFeed' in search) {
          check(
            rows.some((row) => row.feedUrl === undefined),
            `${call}: every row has a feed`,
          );
        }
        if ('none' in search) check(rows.length === 0, `${call}: something was found`);
        scanned(recording);
      },
    });
    written.push(join(dir, `${call}.json`));
    input.out(`${call}: ${shows.length} shows with a feed`);
  }
  return { written };
}

/**
 * `abs-podcasts`: Audiobookshelf's subscribe calls, on a throwaway Audiobookshelf of the
 * household's version, never the household's own: its Podcasts library's folder sits in a temp
 * folder, written as `/data/Podcasts`. In order, 3 s apart: the libraries as Auralis's own key
 * reads them (`podcasts-libraries`); the feed as Audiobookshelf reads it (`podcasts-feed`) and its
 * refusal of a private address (`podcasts-feed-private`); the show made (`podcasts-create`) and
 * made again at the same path (`podcasts-create-exists`); the item read back with Auralis's own key
 * (`podcasts-item`). The feed itself is recorded first, as Auralis reads it (`subscribe-feed`).
 */
export const ABS_PODCAST_CALLS = [
  'podcasts-libraries',
  'podcasts-feed',
  'podcasts-feed-private',
  'podcasts-create',
  'podcasts-create-exists',
  'podcasts-item',
] as const;

/** The folder the recordings name the Podcasts library's by, as the household's is. */
export const RECORDED_PODCASTS_FOLDER = '/data/Podcasts';

/** A private address Audiobookshelf is asked for, which its own filter must refuse. */
export const PRIVATE_FEED = 'http://10.255.255.1/feed.xml';

export interface AbsPodcastsRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  absUrl: string;
  absKey: string;
  provisionKey: string;
  /** The throwaway Podcasts library's folder, as Audiobookshelf names it. */
  folder: string;
  feedUrl: string;
  /** The show's iTunes id, as a search row carries it. */
  itunesId: string | null;
  absVersion: string;
  clock?: Clock;
}

/** The hook: the throwaway folder written as the household's. */
const folderAs =
  (folder: string) =>
  (raw: RawExchange): RawExchange =>
    episodesCut(
      JSON.parse(
        JSON.stringify(raw).replaceAll(folder, RECORDED_PODCASTS_FOLDER),
        notesCut,
      ) as RawExchange,
    );

/** What a show's notes say in a recording, sent and answered alike. */
export const NOTES_CUT = 'Cut by the recorder: show notes name third-party sites.';

/** Show notes, wherever they sit, read as `NOTES_CUT`; a show's own site link goes. */
function notesCut(key: string, value: unknown): unknown {
  if (key === 'link') return undefined;
  if ((key === 'description' || key === 'descriptionPlain') && typeof value === 'string') {
    return value === '' ? value : NOTES_CUT;
  }
  return value;
}

/**
 * The hook's other half: a feed as Audiobookshelf reads it keeps its show and loses its episodes,
 * which nothing here reads; each carries show notes full of third-party hosts.
 */
function episodesCut(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body)) return raw;
  const answer = body.json as { podcast?: { episodes?: unknown[] } } | null;
  if (answer?.podcast?.episodes === undefined) return raw;
  const podcast = { ...answer.podcast, episodes: [] };
  return { ...raw, response: { ...raw.response, body: { json: { ...answer, podcast } } } };
}

export async function recordAbsPodcasts(
  input: AbsPodcastsRecordInput,
): Promise<{ written: string[] }> {
  const clock = input.clock ?? realClock;
  const written: string[] = [];
  const feedDir = join(input.root, 'feed', 'recordings');
  const feedRec = createRecorder({
    fetch: input.fetch,
    dir: feedDir,
    upstream: 'feed',
    upstreamVersion: 'RSS 2.0',
    secrets: [],
    baseUrl: new URL(input.feedUrl).origin,
    prepare: trimFeedExchange,
  });
  const feed = await feedRec.capture(
    'subscribe-feed',
    () => readFeed(feedRec.fetch, input.feedUrl),
    {
      verify: (_found, recording) => scanned(recording),
    },
  );
  written.push(join(feedDir, 'subscribe-feed.json'));
  input.out(`subscribe-feed: ${feed.title ?? '(no title)'}, ${feed.episodes.length} episodes`);

  const dir = join(input.root, 'audiobookshelf', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion: input.absVersion,
    secrets: [input.absKey, input.provisionKey],
    baseUrl: input.absUrl,
    prepare: folderAs(input.folder),
  });
  const abs = new AbsClient({ baseUrl: input.absUrl, token: input.absKey, fetch: rec.fetch });
  const provisioner = new AbsProvisioner({
    baseUrl: input.absUrl,
    provisionKey: input.provisionKey,
    fetch: rec.fetch,
  });
  const step = async <T>(call: string, fn: () => Promise<T>, verify: (found: T) => void) => {
    await clock.sleep(ITUNES_RECORD_GAP_MS);
    const found = await rec.capture(call, fn, {
      verify: (result, recording) => {
        verify(result);
        scanned(recording);
      },
    });
    written.push(join(dir, `${call}.json`));
    return found;
  };

  const libraries = await step(
    'podcasts-libraries',
    () => abs.getLibraries(),
    (found) =>
      check(
        found.filter(({ mediaType }) => mediaType === 'podcast').length === 1,
        'podcasts-libraries: not one Podcasts library',
      ),
  );
  const library = libraries.find(({ mediaType }) => mediaType === 'podcast')!;
  const folder = library.folders?.[0];
  if (folder?.id === undefined) throw new Error('podcasts-libraries: the library has no folder');
  const folderId = folder.id;

  const metadata = await step(
    'podcasts-feed',
    () => provisioner.podcastFeed(input.feedUrl),
    (found) => check(found !== null, 'podcasts-feed: Audiobookshelf read no show'),
  );
  await step(
    'podcasts-feed-private',
    () => provisioner.podcastFeed(PRIVATE_FEED),
    (found) =>
      check(found === null, 'podcasts-feed-private: Audiobookshelf read a private address'),
  );
  const podcast = {
    libraryId: library.id,
    folderId,
    path: posix.join(folder.fullPath, podcastFolderName(metadata!.title)),
    media: {
      metadata: newPodcastMetadata(metadata!, { feedUrl: input.feedUrl, itunesId: input.itunesId }),
      autoDownloadEpisodes: false,
      autoDownloadSchedule: PODCAST_SCHEDULE,
    },
  };
  const made = await step(
    'podcasts-create',
    () => provisioner.createPodcast(podcast),
    (found) => check(found !== 'exists', 'podcasts-create: the show was there already'),
  );
  await step(
    'podcasts-create-exists',
    () => provisioner.createPodcast(podcast),
    (found) => check(found === 'exists', 'podcasts-create-exists: made a second show'),
  );
  await step(
    'podcasts-item',
    () => abs.getItemSummary((made as { id: string }).id),
    (found) => check(found.mediaType === 'podcast', 'podcasts-item: not a show'),
  );
  for (const call of ABS_PODCAST_CALLS) input.out(`${call}: recorded`);
  return { written };
}

/**
 * `abs-stubs`: what the stubbing job reads, on the throwaway Audiobookshelf `abs-podcasts` set up,
 * never the household's. The test feed's two oldest enclosures are read as a stub's first read
 * (`Range: bytes=0-131071`, `stubs-range-1` and `-2`, each body a committed stand-in beside the
 * recording); the two stubs are written from them into the show's folder; then, 3 s apart, with
 * the provisioning key: the show is scanned (`stubs-scan`), and once ABS has probed the stubs, the
 * libraries (`stubs-libraries`), the Podcasts library's shows (`stubs-shows`: the test show and a
 * show standing in for a channel, whose feed is `/feeds/youtube/`), and the test show's episodes
 * (`stubs-episodes`). The throwaway folder is written as `/data/Podcasts`.
 */
export const ABS_STUBS_CALLS = [
  'stubs-scan',
  'stubs-libraries',
  'stubs-shows',
  'stubs-episodes',
] as const;

export interface AbsStubsRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  absUrl: string;
  provisionKey: string;
  folder: string;
  absVersion: string;
  /** The test show's item id, and its folder on this machine. */
  showId: string;
  showFolder: string;
  clock?: Clock;
  /** How long ABS gets to probe the new stubs before they are read back. */
  probeWaitMs?: number;
}

export async function recordAbsStubs(input: AbsStubsRecordInput): Promise<{ written: string[] }> {
  const clock = input.clock ?? realClock;
  const written: string[] = [];
  const feedDir = join(input.root, 'feed', 'recordings');
  const feed = parseFeed(
    (
      JSON.parse(readFileSync(join(feedDir, 'subscribe-feed.json'), 'utf8')) as {
        response: { body: { text: string } };
      }
    ).response.body.text,
  );
  const oldest = oldestFirst(feed.episodes).slice(0, 2);
  const answers = new Map<string, RangeAnswer>();
  for (const [n, episode] of oldest.entries()) {
    const url = episode.enclosureUrl!;
    const call = `stubs-range-${n + 1}`;
    const file = `${call}.mp3`;
    const rec = createRecorder({
      fetch: input.fetch,
      dir: feedDir,
      upstream: 'feed',
      upstreamVersion: 'RSS 2.0',
      secrets: [],
      baseUrl: new URL(url).origin,
    });
    await clock.sleep(ITUNES_RECORD_GAP_MS);
    const answer = await rec.capture(
      call,
      async () => {
        const response = await rec.fetch(url, {
          headers: { range: `bytes=0-${DEFAULT_PREFIX - 1}`, 'user-agent': 'auralis-stubs' },
        });
        const body = new Uint8Array(await response.arrayBuffer());
        writeFileSync(join(feedDir, file), body);
        return {
          status: response.status,
          contentRange: response.headers.get('content-range'),
          body,
        };
      },
      {
        standIn: {
          bytes: file,
          synthesized: 'none: the enclosure’s own first 128 KB, public audio from the test feed',
        },
        verify: (found, recording) => {
          check(found.status === 206, `${call}: answered ${found.status}, not 206`);
          scanned(recording);
        },
      },
    );
    answers.set(url, answer);
    written.push(join(feedDir, `${call}.json`));
    input.out(`${call}: ${answer.status} ${answer.contentRange ?? ''}`);
    await writeStub({
      path: join(input.showFolder, episodeFilenames(episode.title, url)[0]!),
      url,
      declaredLength: episode.enclosureLength,
      rangeGet: async (asked) => answers.get(asked)!,
    });
  }

  const dir = join(input.root, 'audiobookshelf', 'recordings');
  const rec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion: input.absVersion,
    secrets: [input.provisionKey],
    baseUrl: input.absUrl,
    prepare: folderAs(input.folder),
  });
  const provisioner = new AbsProvisioner({
    baseUrl: input.absUrl,
    provisionKey: input.provisionKey,
    fetch: rec.fetch,
  });
  const step = async <T>(call: string, fn: () => Promise<T>, verify: (found: T) => void) => {
    await clock.sleep(ITUNES_RECORD_GAP_MS);
    const found = await rec.capture(call, fn, {
      verify: (result, recording) => {
        verify(result);
        scanned(recording);
      },
    });
    written.push(join(dir, `${call}.json`));
    return found;
  };
  await step(
    'stubs-scan',
    () => provisioner.scanItem(input.showId),
    () => {},
  );
  await clock.sleep(input.probeWaitMs ?? 30_000);
  const [library] = await step(
    'stubs-libraries',
    () => provisioner.podcastLibraryIds(),
    (ids) => check(ids.length === 1, 'stubs-libraries: not one Podcasts library'),
  );
  await step(
    'stubs-shows',
    () => provisioner.podcastShowsIn(library!),
    (shows) =>
      check(
        shows.some((s) => s.feedUrl?.includes('/feeds/youtube/')) && shows.length === 2,
        'stubs-shows: not the test show and the channel',
      ),
  );
  await step(
    'stubs-episodes',
    () => provisioner.showEpisodes(input.showId),
    (episodes) =>
      check(episodes.length === 2, `stubs-episodes: ${episodes.length} episodes, not the 2 stubs`),
  );
  for (const call of ABS_STUBS_CALLS) input.out(`${call}: recorded`);
  return { written };
}

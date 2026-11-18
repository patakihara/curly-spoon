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
import { join } from 'node:path';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { type RawExchange } from './http/scrub.js';
import { type Clock, ItunesClient } from './itunes/client.js';

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

/**
 * Record mode's `books` part: the upstream answers M3.books' search reads, all reads. Nothing is
 * added to any download client: a release's link is only asked where it points.
 *
 * - Prowlarr: a search for a public-domain book as the search step asks it (`search-jekyll`), a
 *   shorter one that reaches indexers with magnets and hashes (`search-jekyll-others`), the book's
 *   Spanish edition (`search-jekyll-spanish`), one of AudiobookBay's links asked with no redirect
 *   followed (`download-redirect`), and a wrong key's answer (`unauthorized`).
 * - AudiobookBay's own site: that release's detail page, cut to the post (`detail`).
 * - Audible, keyless: the same book (`product-jekyll`), a book in two series (`product-dune`), one
 *   with no place in its series (`product-no-sequence`), an ASIN it does not know
 *   (`product-missing`), each cut to the fields the client reads; and Search's keyword searches,
 *   books (`search-jekyll`), podcasts among the rows (`search-podcasts`), nothing (`search-nothing`).
 * - Audnexus, keyless: a search by name (`author-search`), authors with a photo and without
 *   (`author-doyle`, `author-stevenson`), and an ASIN it refuses (`author-missing`).
 *
 * The repo is public and these answers name more than a household's address, so before the scrubber
 * runs: indexers other than AudiobookBay become `indexer-a`, `indexer-b`; a magnet keeps only its
 * hash, as the rest names trackers; a page on an unnamed indexer becomes a digest; a link's opaque `link` parameter (Prowlarr's sealed copy of a
 * tracker's address) becomes a short digest, the same in the row and in the call that asks it. Each
 * answer is scanned before it is written.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { AudibleClient, AUDIBLE_URL } from './audible/client.js';
import { AudnexusClient, AUDNEXUS_URL } from './audnexus/client.js';
import { AdapterError, type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { PLACEHOLDER_ORIGIN, type RawExchange } from './http/scrub.js';
import { ProwlarrClient, type ProwlarrRelease } from './prowlarr/client.js';

/** The query the search step sends for this book: its title and author, as Audible names them. */
export const JEKYLL_QUERY = 'The Strange Case of Dr Jekyll and Mr Hyde Robert Louis Stevenson';
const OTHERS_QUERY = 'Jekyll and Hyde Stevenson';
const SPANISH_QUERY = 'El extraño caso del Dr. Jekyll y Mr. Hyde';

/** The one indexer the plan names. Every other stays out of the public repo. */
const NAMED_INDEXER = 'AudioBook Bay';
/** AudiobookBay's site names no version. */
const AUDIOBOOKBAY_VERSION = 'AudiobookBay site, unversioned';

const digest = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 12);

/** A magnet's hash alone; a link at no address, its opaque parts digested; else as it was. */
function cleanLink(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (value.startsWith('magnet:')) {
    const xt = new URLSearchParams(value.slice(value.indexOf('?') + 1)).get('xt');
    return xt === null ? 'magnet:?' : `magnet:?xt=${xt}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  const link = url.searchParams.get('link');
  const key = url.searchParams.get('apikey');
  const query =
    link === null
      ? url.search
      : `?${key === null ? '' : `apikey=${key}&`}link=link-${digest(link)}`;
  return `${PLACEHOLDER_ORIGIN}${url.pathname}${query}`;
}

/** A row's address of a page on an indexer unnamed here: its path can name a tracker too. */
function cleanPage(value: unknown): unknown {
  if (typeof value !== 'string' || value.startsWith('magnet:')) return cleanLink(value);
  return `${PLACEHOLDER_ORIGIN}/page-${digest(value)}`;
}

const PAGE_FIELDS = ['guid', 'infoUrl', 'commentUrl', 'posterUrl'];
const LINK_FIELDS = ['downloadUrl', 'magnetUrl'];

/**
 * The hook for Prowlarr's recorder, keeping one list of indexers for the whole run: see the file's
 * header for what it takes out.
 */
export function anonymiseProwlarr(): (raw: RawExchange) => RawExchange {
  const standIns = new Map<string, string>();
  const standIn = (indexer: string) => {
    if (indexer === NAMED_INDEXER) return indexer;
    const known = standIns.get(indexer);
    if (known !== undefined) return known;
    const next = `indexer-${String.fromCharCode(97 + standIns.size)}`;
    standIns.set(indexer, next);
    return next;
  };
  const cleanRow = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...row };
    if (typeof row.indexer === 'string') out.indexer = standIn(row.indexer);
    const page = row.indexer === NAMED_INDEXER ? cleanLink : cleanPage;
    for (const field of PAGE_FIELDS) if (field in row) out[field] = page(row[field]);
    for (const field of LINK_FIELDS) if (field in row) out[field] = cleanLink(row[field]);
    delete out.fileName;
    return out;
  };
  return (raw) => {
    const { body, headers } = raw.response;
    const rows = body !== null && 'json' in body && Array.isArray(body.json) ? body.json : null;
    const location = headers.location;
    const url = new URL(raw.request.url);
    return {
      ...raw,
      request: {
        ...raw.request,
        url: url.searchParams.has('link')
          ? (cleanLink(raw.request.url) as string).replace(PLACEHOLDER_ORIGIN, url.origin)
          : raw.request.url,
      },
      response: {
        ...raw.response,
        headers:
          location === undefined
            ? headers
            : { ...headers, location: cleanLink(location) as string },
        body:
          rows === null
            ? body
            : { json: rows.map((row) => cleanRow(row as Record<string, unknown>)) },
      },
    };
  };
}

/** The table rows of a detail page worth keeping: everything else names a tracker or an ad. */
const KEPT_ROW = /Combined File Size|Piece Size|Info Hash/;

/**
 * A detail page cut to what the parser reads: the post's title, its who-reads-it line and the
 * torrent's sizes and hash. No uploader, description, image, tracker or address is left. Fails on a
 * page with no post, such as a challenge, so that none is recorded.
 */
export function trimDetail(page: string): string {
  const title = /<div class="postTitle">[\s\S]*?<\/div>/.exec(page)?.[0];
  const who = /<p[^>]*>\s*Written by[\s\S]*?<\/p>/.exec(page)?.[0];
  const table = /<table[^>]*>[\s\S]*?<\/table>/.exec(page)?.[0];
  if (title === undefined || who === undefined || table === undefined) {
    throw new Error('that page holds no post');
  }
  const rows = [...table.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/g)]
    .map((match) => match[0])
    .filter((row) => KEPT_ROW.test(row));
  const line = who.replace(/\s+itemtype="[^"]*"/g, '').replace(/<a\s[^>]*>/g, '<a>');
  return [
    '<div class="post">',
    title,
    '<div class="postContent"><div class="desc">',
    line,
    '</div>',
    "<table border='1'>",
    ...rows,
    '</table>',
    '</div></div>',
  ].join('\n');
}

/** The hook for the detail page's recorder. */
function cutDetail(raw: RawExchange): RawExchange {
  const { body } = raw.response;
  if (body === null || !('text' in body)) throw new Error('that page came with no text');
  return { ...raw, response: { ...raw.response, body: { text: trimDetail(body.text) } } };
}

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

const AUDIBLE_FIELDS = [
  'content_delivery_type',
  'asin',
  'title',
  'authors',
  'narrators',
  'series',
  'runtime_length_min',
  'release_date',
  'language',
  'merchandising_summary',
];

/** Keeps of a value only the named fields it has. */
function only(value: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([field]) => fields.includes(field)));
}

function cutOneProduct(product: Record<string, unknown>): Record<string, unknown> {
  const kept = only(product, AUDIBLE_FIELDS);
  if (Array.isArray(product.series)) {
    kept.series = (product.series as Record<string, unknown>[]).map((one) =>
      only(one, ['title', 'sequence']),
    );
  }
  const images = product.product_images as Record<string, unknown> | undefined;
  if (images?.['500'] !== undefined) kept.product_images = { 500: images['500'] };
  return kept;
}

/** The hook for Audible's recorder: a product, or a search's, cut to what the client reads. */
export function cutProduct(raw: RawExchange): RawExchange {
  const { body } = raw.response;
  if (body === null || !('json' in body)) throw new Error('that product came with no JSON');
  const { product, products } = body.json as {
    product?: Record<string, unknown>;
    products?: Record<string, unknown>[];
  };
  const json =
    products === undefined
      ? { product: cutOneProduct(product ?? {}) }
      : { products: products.map(cutOneProduct) };
  return { ...raw, response: { ...raw.response, body: { json } } };
}

/** The hook for Audnexus's recorder: an author without their blurb and neighbours. */
export function cutAuthor(raw: RawExchange): RawExchange {
  const { body } = raw.response;
  if (body === null || !('json' in body) || Array.isArray(body.json)) return raw;
  const json = only(body.json as Record<string, unknown>, ['asin', 'name', 'image']);
  return { ...raw, response: { ...raw.response, body: { json } } };
}

/** Search's keyword searches of Audible: read only, keyless. */
export async function recordAudibleSearches(
  input: Pick<BooksRecordInput, 'fetch' | 'out' | 'root'>,
  written: string[],
): Promise<void> {
  const dir = join(input.root, 'audible', 'recordings');
  const audible = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'audible',
    upstreamVersion: 'Audible catalogue API 1.0',
    secrets: [],
    baseUrl: AUDIBLE_URL,
    prepare: cutProduct,
  });
  const catalogue = new AudibleClient({ baseUrl: AUDIBLE_URL, fetch: audible.fetch });
  for (const [call, keywords] of [
    ['search-jekyll', 'jekyll stevenson'],
    ['search-podcasts', 'stuff you should know'],
    ['search-nothing', 'zzqqxxnomatchzz'],
  ] as const) {
    await audible.capture(call, () => catalogue.search(keywords), {
      verify: (_, recording) => scanned(recording),
    });
    written.push(join(dir, `${call}.json`));
    input.out(`${call}: read`);
  }
}

async function recordCatalogues(input: BooksRecordInput, written: string[]): Promise<void> {
  const { fetch, out } = input;
  await recordAudibleSearches(input, written);
  const audibleDir = join(input.root, 'audible', 'recordings');
  const audible = createRecorder({
    fetch,
    dir: audibleDir,
    upstream: 'audible',
    upstreamVersion: 'Audible catalogue API 1.0',
    secrets: [],
    baseUrl: AUDIBLE_URL,
    prepare: cutProduct,
  });
  const products = new AudibleClient({ baseUrl: AUDIBLE_URL, fetch: audible.fetch });
  for (const [call, asin] of [
    ['product-jekyll', 'B09J9BJ8DF'],
    ['product-dune', 'B002V1OF70'],
    ['product-no-sequence', 'B002VA8K2M'],
    ['product-missing', 'B000000000'],
  ] as const) {
    await audible.capture(call, () => products.product(asin), {
      verify: (_, recording) => scanned(recording),
    });
    written.push(join(audibleDir, `${call}.json`));
    out(`${call}: read`);
  }

  const audnexusDir = join(input.root, 'audnexus', 'recordings');
  const audnexus = createRecorder({
    fetch,
    dir: audnexusDir,
    upstream: 'audnexus',
    upstreamVersion: 'Audnexus API, unversioned',
    secrets: [],
    baseUrl: AUDNEXUS_URL,
    prepare: cutAuthor,
  });
  const authors = new AudnexusClient({ baseUrl: AUDNEXUS_URL, fetch: audnexus.fetch });
  const steps: [string, () => Promise<unknown>][] = [
    ['author-search', () => authors.authorsNamed('Robert Louis Stevenson')],
    ['author-stevenson', () => authors.author('B0B8V3KRKX')],
    ['author-doyle', () => authors.author('B000AQ43GQ')],
    ['author-missing', () => authors.author('B0B8V3KRKX123')],
  ];
  for (const [call, step] of steps) {
    await audnexus.capture(call, step, { verify: (_, recording) => scanned(recording) });
    written.push(join(audnexusDir, `${call}.json`));
    out(`${call}: read`);
  }
}

export interface BooksRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  prowlarrUrl: string;
  prowlarrKey: string;
}

export async function recordBooks(input: BooksRecordInput): Promise<{ written: string[] }> {
  const { fetch, out, prowlarrUrl: baseUrl, prowlarrKey: apiKey } = input;
  const dir = join(input.root, 'prowlarr', 'recordings');
  const written: string[] = [];
  const plain = new ProwlarrClient({ baseUrl, apiKey, fetch });
  const rec = createRecorder({
    fetch,
    dir,
    upstream: 'prowlarr',
    upstreamVersion: await plain.version(),
    secrets: [apiKey],
    baseUrl,
    prepare: anonymiseProwlarr(),
  });
  const prowlarr = new ProwlarrClient({ baseUrl, apiKey, fetch: rec.fetch });

  const searches = [
    ['search-jekyll', JEKYLL_QUERY],
    ['search-jekyll-others', OTHERS_QUERY],
    ['search-jekyll-spanish', SPANISH_QUERY],
  ] as const;
  const found = new Map<string, ProwlarrRelease[]>();
  for (const [call, query] of searches) {
    const rows = await rec.capture(call, () => prowlarr.search(query), {
      verify: (answer, recording) => {
        if (answer.length === 0) throw new Error(`${call}: no rows`);
        scanned(recording);
      },
    });
    found.set(call, rows);
    written.push(join(dir, `${call}.json`));
    out(`${call}: ${rows.length} rows`);
  }

  const edition = found
    .get('search-jekyll')
    ?.find(
      (row) => row.source === NAMED_INDEXER && /jekyll/i.test(row.title) && /m4b/i.test(row.title),
    );
  if (edition?.infoUrl == null) throw new Error('no AudiobookBay edition of the book to record');

  await rec.capture('download-redirect', () => prowlarr.resolve({ ...edition.details }), {
    verify: (answer, recording) => {
      if (answer.kind !== 'magnet') throw new Error('that link did not answer with a magnet');
      scanned(recording);
    },
  });
  written.push(join(dir, 'download-redirect.json'));
  out('download-redirect: a magnet');

  const wrong = new ProwlarrClient({ baseUrl, apiKey: 'not-the-key', fetch: rec.fetch });
  await rec.capture(
    'unauthorized',
    () =>
      wrong.search(SPANISH_QUERY).then(
        () => {
          throw new Error('a wrong key was let in');
        },
        (error: unknown) => {
          if (!(error instanceof AdapterError) || error.status !== 401) throw error;
        },
      ),
    { verify: (_, recording) => scanned(recording) },
  );
  written.push(join(dir, 'unauthorized.json'));
  out('unauthorized: 401');

  const page = new URL(edition.infoUrl);
  const siteDir = join(input.root, 'audiobookbay', 'recordings');
  const site = createRecorder({
    fetch,
    dir: siteDir,
    upstream: 'audiobookbay',
    upstreamVersion: AUDIOBOOKBAY_VERSION,
    secrets: [apiKey],
    baseUrl: page.origin,
    prepare: cutDetail,
  });
  await site.capture('detail', () => site.fetch(page.toString()), {
    verify: (_, recording) => scanned(recording),
  });
  written.push(join(siteDir, 'detail.json'));
  out('detail: the post');
  await recordCatalogues(input, written);
  return { written };
}

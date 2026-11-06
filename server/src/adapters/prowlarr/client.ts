/**
 * The Prowlarr client: one search over every indexer it has, and turning a release it found into a
 * magnet or a torrent's bytes (`new ProwlarrClient({ baseUrl, apiKey, fetch, timeoutMs? })`).
 *
 * A row's links point at Prowlarr's own address as it saw it and hold its key, so a parsed release
 * keeps only their path and query, without the key. `resolve` puts both back from this client's own
 * settings. Asked with no redirect followed, a link answers 301 with a `magnet:` location, or 200
 * with a torrent's bytes (recorded: every row today gives a magnet). Details hold a download's
 * address: never log them. A malformed row is skipped and logged by its place and fields alone.
 */
import type { JobLog } from '../../jobs/schedule.js';
import { infoHashFromMagnet, infoHashFromTorrentFile } from '../../requests/download/torrentId.js';
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import { stepFailure } from '../http/unavailable.js';
import {
  type ProwlarrRow,
  prowlarrRowSchema,
  prowlarrSearchSchema,
  prowlarrStatusSchema,
} from './schemas.js';

/** Newznab's audiobook category. */
const AUDIOBOOKS = '3030';
/** A search waits on every indexer; a step may take 120 s before the job fails its request. */
export const PROWLARR_SEARCH_LIMIT_MS = 90_000;
const LINK_LIMIT_MS = 30_000;
/** A torrent file past this is refused rather than read: the bytes are a third party's. */
const TORRENT_MAX_BYTES = 8 * 1024 * 1024;
const API_KEY_PARAM = 'apikey';

/** What it takes to fetch a release, safe to store. */
export interface ProwlarrDetails {
  /** A link's path and query, with no address and no key. */
  link?: string;
  magnet?: string;
  infoHash?: string;
}

export interface ProwlarrRelease {
  title: string;
  /** The indexer's name. */
  source: string;
  size: number | null;
  /** As the indexer lists it, which can be false. */
  seeders: number | null;
  /** The release's page on its indexer. */
  infoUrl: string | null;
  details: ProwlarrDetails;
}

export type ResolvedRelease =
  | { kind: 'magnet'; magnet: string; hash: string }
  | { kind: 'torrent'; bytes: Uint8Array; hash: string };

export interface ProwlarrClientOptions {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
  /** Each call's limit; its own default when not given. */
  timeoutMs?: number;
  /** Told of a row skipped as malformed. */
  log?: JobLog;
}

const isMagnet = (value: string | null | undefined): value is string =>
  value?.toLowerCase().startsWith('magnet:') === true;

/** A link's path and query, with its key gone in whatever case it was written; null if no URL. */
function linkOf(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  for (const name of [...url.searchParams.keys()]) {
    if (name.toLowerCase() === API_KEY_PARAM) url.searchParams.delete(name);
  }
  return url.pathname + url.search;
}

function toRelease(row: ProwlarrRow): ProwlarrRelease | null {
  if (row.protocol !== 'torrent') return null;
  const magnet = [row.guid, row.magnetUrl, row.downloadUrl].find(isMagnet);
  const link = linkOf(row.magnetUrl) ?? linkOf(row.downloadUrl);
  if (magnet === undefined && link === null) return null;
  const hash = row.infoHash?.toLowerCase();
  const details: ProwlarrDetails = {
    ...(link === null ? {} : { link }),
    ...(magnet === undefined ? {} : { magnet }),
    ...(hash !== undefined && /^[0-9a-f]{40}$/.test(hash) ? { infoHash: hash } : {}),
  };
  return {
    title: row.title,
    source: row.indexer ?? 'Prowlarr',
    size: row.size ?? null,
    seeders: row.seeders ?? null,
    infoUrl: row.infoUrl ?? null,
    details,
  };
}

/** A body's bytes, up to the cap. */
async function readBytes(response: Response, call: string): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > TORRENT_MAX_BYTES)
      throw new AdapterError('parse', call, 'the torrent is too large');
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export class ProwlarrClient {
  constructor(private readonly opts: ProwlarrClientOptions) {}

  private url(path: string): URL {
    return new URL(
      path,
      this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`,
    );
  }

  private get keyHeader() {
    return { 'x-api-key': this.opts.apiKey };
  }

  /** Prowlarr's version, as a recording names it. */
  async version(): Promise<string> {
    const { version } = await requestJson(
      this.opts.fetch,
      this.url('api/v1/system/status').toString(),
      { headers: this.keyHeader },
      prowlarrStatusSchema,
    );
    return version;
  }

  /** Every torrent any indexer lists for `query` among audiobooks. */
  async search(query: string): Promise<ProwlarrRelease[]> {
    const url = this.url('api/v1/search');
    url.searchParams.set('query', query);
    url.searchParams.set('categories', AUDIOBOOKS);
    url.searchParams.set('type', 'search');
    try {
      const rows = await requestJson(
        this.opts.fetch,
        url.toString(),
        { headers: this.keyHeader, timeoutMs: this.opts.timeoutMs ?? PROWLARR_SEARCH_LIMIT_MS },
        prowlarrSearchSchema,
      );
      return rows.flatMap((row, index) => {
        const parsed = prowlarrRowSchema.safeParse(row);
        if (parsed.success) return toRelease(parsed.data) ?? [];
        const fields = parsed.error.issues.map((issue) => issue.path.join('.'));
        this.opts.log?.error({ row: index, fields }, 'prowlarr row skipped');
        return [];
      });
    } catch (error) {
      throw stepFailure('prowlarr', error);
    }
  }

  /** The magnet or the torrent a release's details lead to, and its info hash. */
  async resolve(details: ProwlarrDetails): Promise<ResolvedRelease> {
    if (details.magnet !== undefined) {
      const hash = infoHashFromMagnet(details.magnet);
      if (hash !== null) return { kind: 'magnet', magnet: details.magnet, hash };
    }
    if (details.link === undefined) throw new Error('prowlarr: a release with nothing to fetch');
    const [path, query] = details.link.split(/\?(.*)/s);
    const url = this.url('');
    url.pathname = path ?? '';
    url.search = query ?? '';
    url.searchParams.set(API_KEY_PARAM, this.opts.apiKey);
    const call = `GET ${url.pathname}`;
    const limit = this.opts.timeoutMs ?? LINK_LIMIT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limit);
    try {
      const response = await this.ask(url, controller.signal, call, limit);
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400) {
        const hash = location === null ? null : infoHashFromMagnet(location);
        if (location === null || !isMagnet(location) || hash === null) {
          throw new AdapterError('parse', call, 'it redirects to something other than a magnet');
        }
        return { kind: 'magnet', magnet: location, hash };
      }
      if (!response.ok) {
        throw new AdapterError('status', call, `answered ${response.status}`, response.status);
      }
      const bytes = await readBytes(response, call).catch((cause: unknown) => {
        if (cause instanceof AdapterError) throw cause;
        throw new AdapterError('network', call, 'the body did not arrive');
      });
      const hash = infoHashFromTorrentFile(bytes);
      if (hash === null) throw new AdapterError('parse', call, 'the answer is not a torrent');
      return { kind: 'torrent', bytes, hash };
    } catch (error) {
      throw stepFailure('prowlarr', error);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Asks a link. Its failure keeps no cause, as a cause could name the URL and so the key. */
  private async ask(url: URL, signal: AbortSignal, call: string, limit: number): Promise<Response> {
    try {
      return await this.opts.fetch(url.toString(), { method: 'GET', redirect: 'manual', signal });
    } catch {
      if (signal.aborted) throw new AdapterError('timeout', call, `no answer in ${limit} ms`);
      throw new AdapterError('network', call, 'the request failed');
    }
  }
}

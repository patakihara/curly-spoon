/**
 * Prowlarr indexer provider — the recommended source.
 *
 * Prowlarr fans a single search out to every indexer the user has configured there
 * (including ones that need FlareSolverr to clear Cloudflare, which this codebase has no
 * way to solve itself), and normalises them into one Newznab-flavoured JSON array. That
 * makes this the thin provider: build one query, parse one response shape.
 */
import { z } from 'zod';
import { ProviderError } from '../types.js';
import type {
  IndexerFactory,
  IndexerProvider,
  IndexerSearchQuery,
  ProviderFactoryDeps,
  Release,
} from '../types.js';
import { detectFormat } from './format.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Newznab categories: Audio/Audiobook and Books/EBook. Prowlarr's own default when a
 * search omits `categories` is "everything", which is far too broad for a book client. */
const DEFAULT_CATEGORIES = [3030, 7020];

/**
 * Every field is optional because Prowlarr passes indexer responses through with whatever
 * they actually reported — a usenet-backed indexer commonly omits `seeders`/`leechers`
 * entirely, and we drop those results anyway (see below), so there is no reason to demand
 * fields we are about to discard.
 */
const prowlarrCategorySchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
});

const prowlarrReleaseSchema = z.object({
  guid: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  indexer: z.string().optional().nullable(),
  size: z.number().optional().nullable(),
  seeders: z.number().optional().nullable(),
  leechers: z.number().optional().nullable(),
  publishDate: z.string().optional().nullable(),
  downloadUrl: z.string().optional().nullable(),
  magnetUrl: z.string().optional().nullable(),
  protocol: z.string().optional().nullable(),
  categories: z.array(prowlarrCategorySchema).optional().nullable(),
});

const prowlarrResponseSchema = z.array(prowlarrReleaseSchema);

type ProwlarrRelease = z.infer<typeof prowlarrReleaseSchema>;

/** Reads and validates the two pieces of config every Prowlarr call needs, throwing
 * `unauthorized` *before* any network call so a missing credential never costs a request. */
function requireConfig(config: ProviderFactoryDeps['config']): { baseUrl: string; apiKey: string } {
  const baseUrl = config.baseUrl?.trim();
  const apiKey = config.secret?.trim();
  if (!baseUrl || !apiKey) {
    throw new ProviderError(
      'unauthorized',
      'prowlarr',
      'Prowlarr is not configured: a base URL and an API key are both required.',
    );
  }
  return { baseUrl, apiKey };
}

function resolveCategories(options: Record<string, unknown>): number[] {
  const raw = options.categories;
  if (Array.isArray(raw) && raw.length > 0 && raw.every((c) => typeof c === 'number')) {
    return raw as number[];
  }
  return DEFAULT_CATEGORIES;
}

function clampLimit(limit: number | undefined): number {
  const requested = limit ?? DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requested)));
}

/** Runs one authenticated request against Prowlarr and maps transport/HTTP failures onto
 * `ProviderError`. Kept separate from `search`/`testConnection` so both share one mapping. */
async function callProwlarr(
  fetchFn: ProviderFactoryDeps['fetch'],
  url: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { 'X-Api-Key': apiKey }, signal });
  } catch (cause) {
    throw new ProviderError('unreachable', 'prowlarr', 'Could not reach Prowlarr.', { cause });
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderError('unauthorized', 'prowlarr', 'Prowlarr rejected the API key.');
  }
  if (response.status === 404) {
    throw new ProviderError('not_found', 'prowlarr', `Prowlarr has no such endpoint: ${url}`);
  }
  if (!response.ok) {
    throw new ProviderError('rejected', 'prowlarr', `Prowlarr responded with HTTP ${response.status}.`);
  }
  return response;
}

/** `null` when the release has nothing a torrent-only download client could act on, or
 * belongs to a usenet-only indexer entry — Phase 6 ships torrent clients only, so a usenet
 * offer is one we cannot fulfil regardless of how good the match is. */
function toRelease(raw: ProwlarrRelease): Release | null {
  if (raw.protocol === 'usenet') return null;

  const downloadUrl = raw.downloadUrl && raw.downloadUrl.length > 0 ? raw.downloadUrl : null;
  const magnetUri = raw.magnetUrl && raw.magnetUrl.length > 0 ? raw.magnetUrl : null;
  if (!downloadUrl && !magnetUri) return null;

  const title = raw.title ?? '';
  const guid = raw.guid && raw.guid.length > 0 ? raw.guid : (downloadUrl ?? magnetUri ?? title);
  const publishedAtMs = raw.publishDate ? Date.parse(raw.publishDate) : NaN;
  const sizeBytes =
    typeof raw.size === 'number' && Number.isFinite(raw.size) && raw.size > 0 ? raw.size : null;

  return {
    guid,
    indexerId: 'prowlarr',
    sourceName: raw.indexer && raw.indexer.length > 0 ? raw.indexer : 'Prowlarr',
    title,
    sizeBytes,
    seeders: typeof raw.seeders === 'number' && Number.isFinite(raw.seeders) ? raw.seeders : 0,
    leechers: typeof raw.leechers === 'number' && Number.isFinite(raw.leechers) ? raw.leechers : 0,
    publishedAt: Number.isFinite(publishedAtMs) ? publishedAtMs : null,
    downloadUrl,
    magnetUri,
    categories: (raw.categories ?? [])
      .map((c) => c.name)
      .filter((name): name is string => !!name && name.length > 0),
    format: detectFormat(title),
  };
}

function sortReleases(releases: Release[]): void {
  releases.sort((a, b) => {
    if (b.seeders !== a.seeders) return b.seeders - a.seeders;
    if (a.publishedAt === b.publishedAt) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return b.publishedAt - a.publishedAt;
  });
}

export const createProwlarrIndexer: IndexerFactory = ({
  config,
  fetch: fetchFn,
}: ProviderFactoryDeps): IndexerProvider => ({
  id: 'prowlarr',
  displayName: 'Prowlarr',

  async search(query: IndexerSearchQuery, signal?: AbortSignal): Promise<Release[]> {
    const { baseUrl, apiKey } = requireConfig(config);
    const term = (query.author ? `${query.term} ${query.author}` : query.term).trim();
    const limit = clampLimit(query.limit);
    const categories = resolveCategories(config.options);

    const url = new URL('/api/v1/search', baseUrl);
    url.searchParams.set('query', term);
    url.searchParams.set('type', 'search');
    url.searchParams.set('limit', String(limit));
    for (const category of categories) {
      url.searchParams.append('categories', String(category));
    }

    const response = await callProwlarr(fetchFn, url.toString(), apiKey, signal);

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new ProviderError('bad_response', 'prowlarr', 'Prowlarr response was not valid JSON.', {
        cause,
      });
    }
    const parsed = prowlarrResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError(
        'bad_response',
        'prowlarr',
        `Prowlarr response did not match the expected shape: ${parsed.error.message}`,
      );
    }

    const releases = parsed.data
      .map(toRelease)
      .filter((release): release is Release => release !== null);
    sortReleases(releases);
    return releases.slice(0, limit);
  },

  async testConnection(signal?: AbortSignal): Promise<void> {
    const { baseUrl, apiKey } = requireConfig(config);
    const url = new URL('/api/v1/system/status', baseUrl);
    await callProwlarr(fetchFn, url.toString(), apiKey, signal);
  },
});

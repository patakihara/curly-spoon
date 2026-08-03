/**
 * AudiobookBay indexer provider — the fallback for installs without Prowlarr.
 *
 * AudiobookBay has no API, so this scrapes its search-results HTML with regular
 * expressions (no HTML parser is available in this codebase, and none should be added for
 * one provider). That makes it inherently fragile — the site's markup and even its domain
 * change without notice — so every extraction here degrades to "found nothing" rather than
 * throwing. A throw here would read to the request pipeline as "the provider is broken",
 * which is a much worse user experience than "no results today".
 *
 * Search deliberately does **not** resolve a magnet at result time: each result would need
 * its own detail-page fetch, and AudiobookBay is a scraped, rate-limited site — an N+1
 * fetch per search would be the first thing to get this IP blocked. Instead `search`
 * returns the detail page URL as the release's `guid` with `downloadUrl`/`magnetUri` both
 * `null`, and `resolveAudiobookBayMagnet` is called once, later, only for the single
 * release the user actually picks.
 */
import { ProviderError } from '../types.js';
import type {
  IndexerFactory,
  IndexerProvider,
  IndexerSearchQuery,
  ProviderFactoryDeps,
  Release,
} from '../types.js';
import type { FetchLike } from '@auralis/abs-client';
import { detectFormat } from './format.js';

const DEFAULT_LIMIT = 50;

/** AudiobookBay's domain changes often; this is only the last-resort fallback when the
 * provider is enabled with no `baseUrl` configured. */
const DEFAULT_BASE_URL = 'https://audiobookbay.lu';

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
];

/** A post's title anchor: `<a href="/audio-books/some-slug/" title="Some Title">…</a>`.
 * Restricted to hrefs containing `/audio-books/` so nav chrome elsewhere on the page (menu
 * links, pagination) is never mistaken for a search result. Captures the full attribute
 * string (so the `title` attribute can be pulled out separately, since attribute order on
 * the tag is not guaranteed), the href, and the anchor's own text as a fallback title. */
const POST_ANCHOR_REGEX = /<a\s+([^>]*href="([^"]*\/audio-books\/[^"]*)"[^>]*)>([^<]*)<\/a>/gi;

/** Pulls `title="…"` out of an anchor's attribute string, when present. */
const TITLE_ATTR_REGEX = /title="([^"]*)"/i;

/** `Posted: January 1, 2026` in a post's body. */
const POSTED_REGEX = /Posted:\s*([^<\n]+)/i;

/** `File Size: 1.2 GB` in a post's body — AudiobookBay reports 1024-based units. */
const SIZE_REGEX = /File Size:\s*([\d.]+)\s*(GB|MB|KB)/i;

/** `Format: M4B` in a post's body, when the uploader bothered to fill it in. */
const FORMAT_REGEX = /Format:\s*([A-Za-z0-9]+)/i;

/** `Torrent Info Hash: <span>ABCDEF…</span>` (or with no wrapping tag at all) on a detail
 * page. Tolerant of one optional inline tag between the label and the hash, because
 * AudiobookBay themes wrap it in a `<span>`/`<code>` inconsistently. */
const HASH_REGEX = /Torrent Info Hash:\s*(?:<[^>]+>\s*)?([A-Fa-f0-9]{40})/i;

/** `<title>Book Name - AudiobookBay</title>` on a detail page, used as the magnet's `dn`
 * when it is present. */
const DETAIL_TITLE_REGEX = /<title>([^<]*)<\/title>/i;

const BYTES_PER_UNIT: Record<string, number> = {
  GB: 1024 * 1024 * 1024,
  MB: 1024 * 1024,
  KB: 1024,
};

function resolveBaseUrl(config: ProviderFactoryDeps['config']): string {
  const configured = config.baseUrl?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** Shared transport/HTTP error mapping for every AudiobookBay request. A 403 gets its own
 * message: the site sits behind Cloudflare, Prowlarr solves that via FlareSolverr, and a
 * plain scraper cannot — so a 403 here is the single most useful diagnostic this provider
 * can give, and a generic "rejected" would send the user hunting in the wrong direction. */
async function fetchAudiobookBay(
  fetchFn: FetchLike,
  url: string,
  signal?: AbortSignal,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchFn(url, { signal });
  } catch (cause) {
    throw new ProviderError('unreachable', 'audiobookbay', 'Could not reach AudiobookBay.', {
      cause,
    });
  }
  if (response.status === 401) {
    throw new ProviderError('unauthorized', 'audiobookbay', 'AudiobookBay rejected the request.');
  }
  if (response.status === 403) {
    throw new ProviderError(
      'rejected',
      'audiobookbay',
      'AudiobookBay returned HTTP 403 — this is very likely a Cloudflare challenge, which ' +
        'this scraper cannot solve (Prowlarr can, via FlareSolverr; consider it instead).',
    );
  }
  if (response.status === 404) {
    throw new ProviderError('not_found', 'audiobookbay', `AudiobookBay has no such page: ${url}`);
  }
  if (!response.ok) {
    throw new ProviderError(
      'rejected',
      'audiobookbay',
      `AudiobookBay responded with HTTP ${response.status}.`,
    );
  }
  return response;
}

function parseSizeBytes(window: string): number | null {
  const match = window.match(SIZE_REGEX);
  if (!match) return null;
  const value = Number.parseFloat(match[1]!);
  const unit = match[2]!.toUpperCase();
  const perUnit = BYTES_PER_UNIT[unit];
  if (!Number.isFinite(value) || !perUnit) return null;
  return Math.round(value * perUnit);
}

function parsePublishedAt(window: string): number | null {
  const match = window.match(POSTED_REGEX);
  if (!match) return null;
  const ms = Date.parse(match[1]!.trim());
  return Number.isFinite(ms) ? ms : null;
}

/** The pre-container fallback: each post title anchor plus everything up to the next one. */
function anchorWindows(html: string): string[] {
  const anchors = [...html.matchAll(POST_ANCHOR_REGEX)].map((m) => m.index ?? 0);
  return anchors.map((start, i) => html.slice(start, anchors[i + 1] ?? html.length));
}

function parseFormat(window: string, title: string): string | null {
  const match = window.match(FORMAT_REGEX);
  if (match) return match[1]!.toLowerCase();
  return detectFormat(title);
}

/**
 * Cuts the page into one chunk per rendered post, using the container each result sits in.
 *
 * This exists because inferring post boundaries from *anchor* positions is wrong in a way
 * that is easy to miss and expensive when it happens. AudiobookBay runs on WordPress, whose
 * templates put ordinary links — a breadcrumb, a category tag, a "related" list — inside
 * each post, between its title and its metadata. Every one of those also points under
 * `/audio-books/`. With anchor-delimited windows, such a link ends the real post's window
 * early, so the post loses its size and date *and* the stray link becomes an extra release
 * that inherits them. It is a template element, so it happens on every post at once: the
 * whole result set turns to junk while still looking like a successful search.
 *
 * Container boundaries do not have that failure. Returns `null` when the page has no
 * recognisable containers, so the caller can fall back rather than reporting nothing.
 */
const POST_BLOCK_REGEX = /<div[^>]*\bclass="[^"]*\bpost\b[^"]*"[^>]*>/gi;

function splitPostBlocks(html: string): string[] | null {
  const starts = [...html.matchAll(POST_BLOCK_REGEX)].map((m) => m.index ?? 0);
  if (starts.length === 0) return null;
  return starts.map((start, i) => html.slice(start, starts[i + 1] ?? html.length));
}

/** The first anchor in a block that looks like a post title, with its resolved URL. */
function firstPostAnchor(block: string, baseUrl: string): { title: string; url: string } | null {
  for (const anchor of block.matchAll(POST_ANCHOR_REGEX)) {
    const [, attrs, href, anchorText] = anchor;
    const title = (attrs!.match(TITLE_ATTR_REGEX)?.[1] ?? anchorText ?? '').trim();
    if (!title) continue;
    try {
      return { title, url: new URL(href!, baseUrl).toString() };
    } catch {
      continue; // Malformed href — skip it rather than fail the whole search.
    }
  }
  return null;
}

/**
 * Extracts one release per post. Prefers container-delimited blocks (see `splitPostBlocks`)
 * and falls back to anchor-delimited windows when the markup has no recognisable containers
 * — the fallback is the weaker heuristic, but a weaker guess beats no results from a
 * provider that only exists for installs without Prowlarr.
 */
function extractReleases(html: string, baseUrl: string): Release[] {
  const blocks = splitPostBlocks(html) ?? anchorWindows(html);
  const releases: Release[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const anchor = firstPostAnchor(block, baseUrl);
    if (!anchor) continue;
    // A post repeated across blocks (a "related" list echoing an earlier result) must not
    // become a second entry for the same book.
    if (seen.has(anchor.url)) continue;
    seen.add(anchor.url);

    releases.push({
      guid: anchor.url,
      indexerId: 'audiobookbay',
      sourceName: 'AudiobookBay',
      title: anchor.title,
      sizeBytes: parseSizeBytes(block),
      seeders: 0,
      leechers: 0,
      publishedAt: parsePublishedAt(block),
      downloadUrl: null,
      magnetUri: null,
      categories: [],
      format: parseFormat(block, anchor.title),
    });
  }

  return releases;
}

export const createAudiobookBayIndexer: IndexerFactory = ({
  config,
  fetch: fetchFn,
}: ProviderFactoryDeps): IndexerProvider => ({
  id: 'audiobookbay',
  displayName: 'AudiobookBay',

  async search(query: IndexerSearchQuery, signal?: AbortSignal): Promise<Release[]> {
    const baseUrl = resolveBaseUrl(config);
    const term = (query.author ? `${query.term} ${query.author}` : query.term).trim();
    const limit = query.limit && query.limit > 0 ? Math.trunc(query.limit) : DEFAULT_LIMIT;

    const url = new URL(`${baseUrl}/`);
    url.searchParams.set('s', term);

    const response = await fetchAudiobookBay(fetchFn, url.toString(), signal);
    const html = await response.text();

    return extractReleases(html, baseUrl).slice(0, limit);
  },

  async testConnection(signal?: AbortSignal): Promise<void> {
    const baseUrl = resolveBaseUrl(config);
    await fetchAudiobookBay(fetchFn, `${baseUrl}/`, signal);
  },

  /**
   * The `IndexerProvider.resolveDownload` hook: search results from this provider carry no
   * `magnetUri` (see the module doc comment), so the request service calls this once, on
   * the single release the user picked, to fill it in. A thin wrapper over
   * `resolveAudiobookBayMagnet` — it does not re-fetch or re-derive the hash itself — that
   * additionally prefers the listing's own title for the magnet's `dn`, since that is the
   * title the user actually searched for and picked, over the detail page's `<title>` tag.
   */
  async resolveDownload(release: Release, signal?: AbortSignal): Promise<Release> {
    if (release.magnetUri) return release;
    const magnetUri = await resolveAudiobookBayMagnet(release.guid, fetchFn, signal);
    return {
      ...release,
      magnetUri:
        release.title.trim().length > 0 ? withDisplayName(magnetUri, release.title) : magnetUri,
    };
  },
});

/** Swaps a magnet URI's `dn=` value for a different display name, without touching the
 * hash or trackers. Used by `resolveDownload` to prefer the listing title over the detail
 * page's `<title>` tag, without `resolveAudiobookBayMagnet` needing to know about that
 * preference. */
function withDisplayName(magnet: string, displayName: string): string {
  return magnet.replace(/dn=[^&]*/, `dn=${encodeURIComponent(displayName)}`);
}

/**
 * Resolves one AudiobookBay detail page into a magnet URI. Deferred out of `search` (see
 * the module doc comment above) so it costs exactly one request, made only when the user
 * has actually chosen this release.
 */
export async function resolveAudiobookBayMagnet(
  detailUrl: string,
  fetchFn: FetchLike,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetchAudiobookBay(fetchFn, detailUrl, signal);
  const html = await response.text();

  const hashMatch = html.match(HASH_REGEX);
  if (!hashMatch) {
    throw new ProviderError(
      'not_found',
      'audiobookbay',
      `No torrent info hash found on ${detailUrl} — the page layout may have changed.`,
    );
  }
  const hash = hashMatch[1]!.toLowerCase();

  const titleMatch = html.match(DETAIL_TITLE_REGEX);
  const displayName = titleMatch?.[1]?.trim() || hash;

  const params = [`xt=urn:btih:${hash}`, `dn=${encodeURIComponent(displayName)}`];
  for (const tracker of TRACKERS) {
    params.push(`tr=${encodeURIComponent(tracker)}`);
  }
  return `magnet:?${params.join('&')}`;
}

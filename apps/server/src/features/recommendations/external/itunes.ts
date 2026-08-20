/**
 * The iTunes/Apple Podcasts Search API — wave 15e-podcasts' podcast provider.
 * `docs/research/RECOMMENDATION_PROVIDERS.md` §4 named PodcastIndex as the primary catalogue
 * (feed URL/GUID map cleanly onto what Audiobookshelf stores) with iTunes as the alternative.
 * This wave uses **iTunes instead**, a decision made at dispatch time and recorded in
 * `docs/HANDOVER.md`: PodcastIndex needs a free-but-real key + secret Sofia would have to go
 * create, where iTunes needs **no credential of any kind**. Both are catalogues, not
 * recommenders — confirmed live below, matching §4's own finding that no true podcast
 * recommender exists among free/open sources.
 *
 * **What was verified live, 2026-08-19, before any code was written here** (the fixture-
 * validates-the-response lesson this project keeps re-learning — `docs/HANDOVER.md`'s "A
 * fixture validates the response and says nothing about the request"):
 *
 * - `GET /search?media=podcast&term=<text>` returns real, well-formed results with **no
 *   required parameters beyond `term`** — unlike ListenBrainz's five-parameter endpoint, a
 *   bare `term=science` returned five genuinely science-genre shows.
 * - **`genreId` alone, with no `term`, returns `resultCount: 0`.** There is no standalone
 *   "browse this genre" surface — `?media=podcast&genreId=1304` (no term) came back empty.
 *   So a numeric iTunes genre-id mapping would buy nothing on its own; `term=<genre name>`
 *   is the only thing that actually returns results, and it was verified to work directly
 *   with the plain-English genre strings Audiobookshelf already stores (`term=science`,
 *   `term=TWiT` — a publisher name — both returned relevant, well-targeted results).
 * - `GET /lookup?id=<artistId>&entity=podcast` returns **every show by that publisher**
 *   (confirmed against TWiT's catalogue, 51 shows) — a genuine "more from this network"
 *   surface. **Not used here**: it needs an iTunes-catalogue `artistId`, which Audiobookshelf's
 *   `Podcast` type never carries (no such field exists anywhere in the normalized domain
 *   type), so using it would require a first fuzzy name-lookup hop to resolve one — the exact
 *   extra hop `openlibrary.ts`'s header comment rejected for Audnexus, and for the identical
 *   reason: an unnecessary resolution step this wave doesn't need for term search to work.
 *
 * **The query is "more shows in a genre she already listens to"**, not "more by a publisher
 * she already listens to" — a deliberately different choice from `openlibrary.ts`'s
 * author-based seeding. Podcast networks that publish many shows under one name (TWiT) are
 * the exception, not the rule; most podcasts have a single, non-prolific host, so seeding on
 * publisher name would rarely surface more than the one show already owned. Genre affinity
 * (`TasteProfile.affinities.genre`, already computed identically for podcasts and books via
 * `adapt.ts`'s `toCandidate`) is the facet `docs/research/RECOMMENDATION_PROVIDERS.md` §4
 * itself recommends ("more from this show's genre"), and it is what was verified live above.
 *
 * **Never populate `identifiers.feedUrl` on a candidate — deliberate, mirroring
 * `openlibrary.ts`'s ISBN reasoning exactly.** `ownership.ts`'s `comparePair` treats a
 * same-field, different-value identifier as a **veto** that bypasses the title/author
 * heuristic entirely and forces `no-match`. iTunes' `feedUrl` for a real show and
 * Audiobookshelf's own stored `feedUrl` for the same real show are not guaranteed to be
 * byte-identical strings — a feed redirect Audiobookshelf followed at subscribe time, a
 * protocol difference, or a trailing slash would all produce two different strings for the
 * same podcast. Setting `feedUrl` here would risk exactly the leak this whole wave exists to
 * avoid: a genuinely-owned show reported as "external" because its feed URL string didn't
 * match byte-for-byte. Leaving `identifiers` empty lets `comparePair` fall through cleanly to
 * the title/author heuristic, the reliable path — `podcastExternalDiscovery.ts`'s ownership
 * pool populates the *library* side's real `feedUrl` for a future provider that can use it
 * more precisely (PodcastIndex, keyed on feed URL per the research doc); nothing on the
 * candidate side ever triggers the veto because nothing on this side declares the field.
 */

import { z } from 'zod';
import type { FetchLike } from '@auralis/abs-client';
import type {
  ExternalCandidate,
  ExternalRecommendationProvider,
  RecommendationSeed,
} from './types.js';

export const ITUNES_PROVIDER_NAME = 'itunes';

const DEFAULT_BASE_URL = 'https://itunes.apple.com';
/** Mirrors `openlibrary.ts`'s `MAX_SEEDS_QUERIED` — bounds fan-out from an unbounded genre
 * affinity list. iTunes documents no rate limit for `/search`, but an unbounded
 * one-request-per-genre loop is the wrong default regardless. */
const MAX_SEEDS_QUERIED = 3;
const DEFAULT_LIMIT = 20;
/** Requested per seed, deliberately larger than `DEFAULT_LIMIT` — same "filtering still
 * usually leaves enough to fill a shelf" reasoning `openlibrary.ts`'s `RESULTS_PER_SEED`
 * comment gives, since some results will already be owned or duplicate across genres. */
const RESULTS_PER_SEED = 20;

/** Every field optional/nullable, verified live 2026-08-19 rather than assumed — a real
 * search response's `artistName`/`feedUrl`/`genres` are present on well-formed shows and
 * there's no guarantee every result carries all of them (a malformed or partial catalogue
 * entry is normal for a public search index, not drift). A result missing `collectionId`
 * (and `trackId`, its fallback) or a title is skipped — nothing to namespace an id or a card
 * with — rather than failing the whole response, same convention `openlibrary.ts`'s doc
 * schema follows. */
const itunesPodcastResultSchema = z.object({
  collectionId: z.number().nullable().optional(),
  trackId: z.number().nullable().optional(),
  collectionName: z.string().nullable().optional(),
  trackName: z.string().nullable().optional(),
  artistName: z.string().nullable().optional(),
  genres: z.array(z.string().nullable()).nullable().optional(),
  primaryGenreName: z.string().nullable().optional(),
});

const itunesSearchResponseSchema = z.object({
  results: z.array(itunesPodcastResultSchema),
});

export interface ItunesLogger {
  warn(context: unknown, message: string): void;
}

const noopLogger: ItunesLogger = { warn: () => {} };

export interface ItunesProviderDeps {
  fetch: FetchLike;
  /** Defaults to the real iTunes Search API. Overridable so a test never needs a real
   * hostname, mirroring `listenbrainz.ts`/`openlibrary.ts`'s own `baseUrl` config. */
  baseUrl?: string;
  logger?: ItunesLogger;
}

/** One `fetch` + parse for one genre term. Never throws — every failure class (network,
 * non-2xx, unparseable JSON, schema mismatch) is caught here, logged, and folded into `[]`,
 * so `recommend()`'s per-seed loop never needs its own try/catch. */
async function searchByGenreTerm(
  deps: Required<Pick<ItunesProviderDeps, 'fetch' | 'baseUrl' | 'logger'>>,
  genreTerm: string,
): Promise<z.infer<typeof itunesPodcastResultSchema>[]> {
  // Verified live 2026-08-19: `media=podcast&term=<text>` alone returns 200 with real,
  // relevant results — unlike ListenBrainz, this endpoint has no other mandatory parameter.
  // `genreId` was tried and confirmed to return nothing without a `term` alongside it (see
  // this file's header comment), so it is deliberately not sent.
  const query = new URLSearchParams({
    media: 'podcast',
    term: genreTerm,
    limit: String(RESULTS_PER_SEED),
  });
  const url = `${deps.baseUrl}/search?${query.toString()}`;
  let response: Response;
  try {
    response = await deps.fetch(url);
  } catch (err) {
    deps.logger.warn({ err, genreTerm }, 'itunes: request failed, degrading to no candidates');
    return [];
  }
  if (!response.ok) {
    deps.logger.warn(
      { status: response.status, genreTerm },
      'itunes: non-OK response, degrading to no candidates',
    );
    return [];
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    deps.logger.warn(
      { err, genreTerm },
      'itunes: response body was not JSON, degrading to no candidates',
    );
    return [];
  }
  const parsed = itunesSearchResponseSchema.safeParse(body);
  if (!parsed.success) {
    deps.logger.warn(
      { issues: parsed.error.issues, genreTerm },
      'itunes: response did not match the expected shape, degrading to no candidates',
    );
    return [];
  }
  return parsed.data.results;
}

/**
 * Builds an `ExternalRecommendationProvider` for podcasts, backed by the iTunes Search API.
 * Takes an injected `fetch` — no network in unit tests, same rule every client in this repo
 * follows.
 */
export function createItunesProvider(deps: ItunesProviderDeps): ExternalRecommendationProvider {
  const resolved = {
    fetch: deps.fetch,
    baseUrl: deps.baseUrl ?? DEFAULT_BASE_URL,
    logger: deps.logger ?? noopLogger,
  };

  return {
    providerName: ITUNES_PROVIDER_NAME,
    medium: 'podcast',
    async recommend(
      seeds: readonly RecommendationSeed[],
      limit = DEFAULT_LIMIT,
    ): Promise<ExternalCandidate[]> {
      const genreSeeds = seeds
        .filter((seed) => seed.label.trim().length > 0)
        .slice(0, MAX_SEEDS_QUERIED);
      if (genreSeeds.length === 0) return [];

      const results: ExternalCandidate[] = [];
      const seenShowIds = new Set<string>();

      for (const seed of genreSeeds) {
        const shows = await searchByGenreTerm(resolved, seed.label);

        for (const show of shows) {
          // `collectionId` is the show-level id per iTunes' own semantics; `trackId` is its
          // fallback — verified live that the two are identical for a podcast search result,
          // but `collectionId` is documented as the canonical one.
          const providerIdNumber = show.collectionId ?? show.trackId;
          const title = show.collectionName?.trim() || show.trackName?.trim();
          if (providerIdNumber == null || !title) continue;
          const providerId = String(providerIdNumber);
          if (seenShowIds.has(providerId)) continue;
          seenShowIds.add(providerId);

          const authorName = show.artistName?.trim();
          const authors = authorName ? [authorName] : [];

          const genres = (show.genres ?? [])
            .map((genre) => genre?.trim())
            .filter((genre): genre is string => !!genre);
          if (genres.length === 0 && show.primaryGenreName?.trim()) {
            genres.push(show.primaryGenreName.trim());
          }

          results.push({
            providerName: ITUNES_PROVIDER_NAME,
            providerId,
            medium: 'podcast',
            title,
            authors,
            genres,
            // Deliberately empty — see this file's header comment on why an iTunes feedUrl
            // must never be threaded into `identifiers`.
            identifiers: {},
            reason: `Because you listen to ${seed.label} podcasts`,
          });

          if (results.length >= limit) return results;
        }
      }

      return results;
    },
  };
}

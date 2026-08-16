/**
 * ListenBrainz — the one genuine recommender the phase 15 provider survey found
 * (`docs/research/RECOMMENDATION_PROVIDERS.md`). This wires its **tier 1** surface only:
 * `GET /1/lb-radio/artist/(mbid)`, public, MBID-seeded, no credential needed. Tier 2
 * (genuinely personalised, needs her own ListenBrainz account with Jellyfin scrobbling
 * connected) is not implemented — flagged in this wave's report, not built unimplemented.
 *
 * **The endpoint's shape here is source-derived, not observed against a live response** —
 * the same caveat `docs/HANDOVER.md` records for `packages/abs-client`'s original fixtures.
 * It was fetched from ListenBrainz's own server source
 * (`listenbrainz/webserver/views/api.py`'s `get_artist_radio_recordings`, 2026-08-16) rather
 * than guessed from prose, which is stronger than nothing, but "we read the route's
 * docstring and its jsonify call" is not the same as "we saw a real 200 body". Every field
 * below is optional/nullable for exactly that reason, and one test feeds an explicit `null`.
 *
 * **Response shape, per that source read:** `GET /1/lb-radio/artist/<mbid>?mode=easy` returns
 * `jsonify(lb_radio_artist(...))` directly — no `payload` wrapper — as a JSON object keyed by
 * artist MBID (the seed artist and each similar artist found), each value an array of
 * `{ recording_mbid, similar_artist_mbid, similar_artist_name, total_listen_count }`.
 *
 * **The endpoint has no track/recording title anywhere in its response** — only
 * `recording_mbid`, a bare MusicBrainz recording id. Resolving that to a playable track name
 * would need a second lookup (a MusicBrainz recording fetch) that is out of this wave's
 * scope. So this provider recommends at **artist granularity**: one `ExternalCandidate` per
 * distinct `similar_artist_mbid`, titled with `similar_artist_name`, carrying
 * `musicBrainzArtistId` as its identifier. That lines up with `ownership.ts`'s
 * `musicBrainzArtistId` field and with Jellyfin's own `Artist` domain type, so 15b's matcher
 * can compare it against a real library artist with no further adaptation. Recording-level
 * recommendation (a specific track) is a real future extension, not built here.
 */

import { z } from 'zod';
import type { FetchLike } from '@auralis/abs-client';
import type {
  ExternalCandidate,
  ExternalRecommendationProvider,
  RecommendationSeed,
} from './types.js';

export const LISTENBRAINZ_PROVIDER_NAME = 'listenbrainz';

const DEFAULT_BASE_URL = 'https://api.listenbrainz.org';
/** How many of the caller's seeds to actually query. ListenBrainz rate-limits this endpoint
 * server-side (`@ratelimit()` in its own route); capping the fan-out keeps one `recommend()`
 * call from turning into an unbounded burst regardless of how many seeds are handed in. */
const MAX_SEEDS_QUERIED = 3;
const DEFAULT_LIMIT = 20;

/** Every field optional/nullable — see this file's header comment on why. An entry missing
 * `similar_artist_mbid` or `similar_artist_name` cannot become a candidate (nothing to key or
 * title it with) and is skipped rather than failing the whole response. */
const lbRadioArtistEntrySchema = z.object({
  recording_mbid: z.string().nullable().optional(),
  similar_artist_mbid: z.string().nullable().optional(),
  similar_artist_name: z.string().nullable().optional(),
  total_listen_count: z.number().nullable().optional(),
});

/** Keyed by artist MBID (the seed and each similar artist found); each value the list of
 * entries documented above. `z.record` degrades gracefully if a key's value is an empty
 * array (a resolved-but-empty artist) — nothing about an empty list fails parsing. */
const lbRadioArtistResponseSchema = z.record(z.string(), z.array(lbRadioArtistEntrySchema));

export interface ListenBrainzLogger {
  warn(context: unknown, message: string): void;
}

const noopLogger: ListenBrainzLogger = { warn: () => {} };

export interface ListenBrainzProviderDeps {
  fetch: FetchLike;
  /** Defaults to the real ListenBrainz API. Overridable so a test never needs a real
   * hostname, mirroring `AbsClient`/`JellyfinClient`'s `baseUrl` config. */
  baseUrl?: string;
  /** Defaults to a no-op — this provider must never throw (see `ExternalRecommendationProvider`'s
   * doc comment), but a silent `[]` for every failure class is undiagnosable, the same trap
   * `tryBuildMusicGenreProfile` in `routes/libraries.ts` already names. A caller wiring this
   * into the app passes `app.log`; a unit test passes a spy. */
  logger?: ListenBrainzLogger;
}

/** One `fetch` + parse for one seed artist MBID. Never throws — every failure class (network,
 * non-2xx, unparseable JSON, schema mismatch) is caught here, logged, and folded into `[]`, so
 * `recommend()`'s per-seed loop never needs its own try/catch. */
async function fetchSimilarArtists(
  deps: Required<Pick<ListenBrainzProviderDeps, 'fetch' | 'baseUrl' | 'logger'>>,
  seedArtistMbid: string,
): Promise<Record<string, z.infer<typeof lbRadioArtistEntrySchema>[]>> {
  const url = `${deps.baseUrl}/1/lb-radio/artist/${encodeURIComponent(seedArtistMbid)}?mode=easy`;
  let response: Response;
  try {
    response = await deps.fetch(url);
  } catch (err) {
    deps.logger.warn(
      { err, seedArtistMbid },
      'listenbrainz: request failed, degrading to no candidates',
    );
    return {};
  }
  if (!response.ok) {
    deps.logger.warn(
      { status: response.status, seedArtistMbid },
      'listenbrainz: non-OK response, degrading to no candidates',
    );
    return {};
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    deps.logger.warn(
      { err, seedArtistMbid },
      'listenbrainz: response body was not JSON, degrading to no candidates',
    );
    return {};
  }
  const parsed = lbRadioArtistResponseSchema.safeParse(body);
  if (!parsed.success) {
    deps.logger.warn(
      { issues: parsed.error.issues, seedArtistMbid },
      'listenbrainz: response did not match the expected shape, degrading to no candidates',
    );
    return {};
  }
  return parsed.data;
}

/**
 * Builds a `ExternalRecommendationProvider` for music, backed by ListenBrainz tier 1. Takes
 * an injected `fetch` — no network in unit tests, same rule every client in this repo follows.
 */
export function createListenBrainzProvider(
  deps: ListenBrainzProviderDeps,
): ExternalRecommendationProvider {
  const resolved = {
    fetch: deps.fetch,
    baseUrl: deps.baseUrl ?? DEFAULT_BASE_URL,
    logger: deps.logger ?? noopLogger,
  };

  return {
    providerName: LISTENBRAINZ_PROVIDER_NAME,
    medium: 'music',
    async recommend(
      seeds: readonly RecommendationSeed[],
      limit = DEFAULT_LIMIT,
    ): Promise<ExternalCandidate[]> {
      const musicSeeds = seeds
        .filter((seed) => !!seed.identifiers.musicBrainzArtistId?.trim())
        .slice(0, MAX_SEEDS_QUERIED);
      if (musicSeeds.length === 0) return [];

      const results: ExternalCandidate[] = [];
      const seenArtistMbids = new Set<string>();

      for (const seed of musicSeeds) {
        // Guarded by the `.filter()` above; trimmed again here since a caller could hand in
        // a value with surrounding whitespace that still passed the truthiness check.
        const seedArtistMbid = seed.identifiers.musicBrainzArtistId!.trim();
        const byArtist = await fetchSimilarArtists(resolved, seedArtistMbid);

        for (const entries of Object.values(byArtist)) {
          for (const entry of entries) {
            const similarArtistMbid = entry.similar_artist_mbid?.trim();
            const similarArtistName = entry.similar_artist_name?.trim();
            if (!similarArtistMbid || !similarArtistName) continue;
            // Not a new discovery — it is the seed artist's own catalogue.
            if (similarArtistMbid === seedArtistMbid) continue;
            if (seenArtistMbids.has(similarArtistMbid)) continue;
            seenArtistMbids.add(similarArtistMbid);

            results.push({
              providerName: LISTENBRAINZ_PROVIDER_NAME,
              providerId: similarArtistMbid,
              medium: 'music',
              title: similarArtistName,
              // An artist-granularity candidate has no separate "author" — see this file's
              // header comment on why granularity landed here rather than on the track.
              authors: [],
              genres: [],
              identifiers: { musicBrainzArtistId: similarArtistMbid },
              reason: `Similar to ${seed.label}`,
            });

            if (results.length >= limit) return results;
          }
        }
      }

      return results;
    },
  };
}

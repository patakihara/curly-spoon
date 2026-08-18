/**
 * Open Library — wave 15e-books' book provider. `docs/research/RECOMMENDATION_PROVIDERS.md`
 * §3 named Audnexus/AudiMeta (ASIN-keyed) as the candidate catalogues, paired with "a
 * taste-driven query strategy Auralis builds itself" since neither is a recommender. This
 * file diverges from that in one respect, verified live rather than assumed — see below.
 *
 * **Why Open Library instead of Audnexus, stated rather than silently substituted.**
 * Audnexus (`api.audnex.us`) has exactly two useful routes: `GET /authors?name=` (search)
 * and `GET /authors/{asin}` (an author's own metadata, including a `similar` authors list).
 * Neither gives a *book* by a given author — there is no `/books?author=` and no
 * `/authors/{asin}/books`; both were tried live 2026-08-18 and both 404. So Audnexus alone
 * cannot answer "what unowned book should we recommend": it can name a similar author, but
 * has no way to list that author's catalogue. The research doc's own fallback — "Open
 * Library as a redundant fallback, since it needs no key at all" — is promoted here to the
 * primary (and only) source, because it can do the whole job in one call: `search.json
 * ?author=<name>` returns real works by that author, ISBN-bearing, needing zero credential
 * and zero id-resolution hop. Using Audnexus *as well*, purely for its `similar` authors
 * list, would add a three-hop chain (resolve the seed author's own ASIN by a fuzzy name
 * search — verified live to return noisy near-matches, e.g. searching "Brandon Sanderson"
 * also surfaces "Brandon Fogel" and "Bill Sanderson" — then read `similar`, then still need
 * a second catalogue to list *that* author's books) for a benefit this wave doesn't need.
 *
 * **The query is "more by an author she already loves", not "a new author like the one she
 * loves"** — deliberately different from `listenbrainz.ts`'s artist-similarity shape. Every
 * result Open Library returns for `author=<seed>` is already *by* that seed author, so
 * `authorsOverlap` in `ownership.ts` will be true for essentially every candidate by
 * construction — the ownership filter therefore hinges on **title**, which is exactly the
 * intended behaviour: keep the books by an author she loves that her library doesn't have
 * yet, drop the ones it does. `docs/research/RECOMMENDATION_PROVIDERS.md` §3 names this
 * itself as one of the three valid query strategies ("more by an author she rates highly").
 *
 * **Never populate `identifiers.isbn` on a candidate — this is deliberate, not an
 * oversight.** Open Library's `isbn[]` on a work covers print editions; an audiobook's own
 * ISBN (what `Book.isbn` in `packages/abs-client` actually holds) is frequently a distinct
 * number assigned to the audio release and will not appear in that array. `ownership.ts`'s
 * `comparePair` treats an identifier field present on *both* sides with *different* values
 * as a veto — it *contradicts* an otherwise-correct title/author match and forces `new-match`
 * even when the title is identical. Setting a near-certainly-wrong `isbn` here would
 * therefore make an owned book more likely to leak through as "external", the one failure
 * this whole wave exists to avoid. Leaving `identifiers` empty lets `comparePair` fall
 * through cleanly to the title/author heuristic, which is the reliable path for this
 * provider's shape of candidate.
 */

import { z } from 'zod';
import type { FetchLike } from '@auralis/abs-client';
import type {
  ExternalCandidate,
  ExternalRecommendationProvider,
  RecommendationSeed,
} from './types.js';

export const OPENLIBRARY_PROVIDER_NAME = 'openlibrary';

const DEFAULT_BASE_URL = 'https://openlibrary.org';
/** Mirrors `listenbrainz.ts`'s `MAX_SEEDS_QUERIED` — bounds fan-out from an unbounded seed
 * list, independent of any rate limit (Open Library documents none for `/search.json`, but
 * an unbounded loop issuing one request per author affinity is the wrong default anyway). */
const MAX_SEEDS_QUERIED = 3;
const DEFAULT_LIMIT = 20;
/** How many results to request from Open Library per seed — deliberately larger than
 * `DEFAULT_LIMIT`, the same "filtering still usually leaves enough to fill a shelf" reasoning
 * `routes/jellyfin.ts`'s `MUSIC_EXTERNAL_CANDIDATE_LIMIT` comment gives, since most of an
 * author's catalogue may already be owned. */
const RESULTS_PER_SEED = 20;

/** Every field optional/nullable — the trap `packages/abs-client` was burned by (a schema
 * accepting only `undefined` silently rejecting a server's literal `null`) applies here too,
 * even though this endpoint was verified live: a field genuinely absent from one doc and
 * present on another is normal for a free-text search index, not drift. A doc missing `key`
 * or `title` is skipped — nothing to namespace an id or a card with — rather than failing
 * the whole response. */
const openLibraryDocSchema = z.object({
  key: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  author_name: z.array(z.string().nullable()).nullable().optional(),
});

const openLibrarySearchResponseSchema = z.object({
  docs: z.array(openLibraryDocSchema),
});

export interface OpenLibraryLogger {
  warn(context: unknown, message: string): void;
}

const noopLogger: OpenLibraryLogger = { warn: () => {} };

export interface OpenLibraryProviderDeps {
  fetch: FetchLike;
  /** Defaults to the real Open Library API. Overridable so a test never needs a real
   * hostname, mirroring `listenbrainz.ts`'s own `baseUrl` config. */
  baseUrl?: string;
  logger?: OpenLibraryLogger;
}

/** One `fetch` + parse for one seed author name. Never throws — every failure class
 * (network, non-2xx, unparseable JSON, schema mismatch) is caught here, logged, and folded
 * into `[]`, so `recommend()`'s per-seed loop never needs its own try/catch. */
async function searchByAuthor(
  deps: Required<Pick<OpenLibraryProviderDeps, 'fetch' | 'baseUrl' | 'logger'>>,
  authorName: string,
): Promise<z.infer<typeof openLibraryDocSchema>[]> {
  // Verified live 2026-08-18: `author=<name>` alone returns 200 with real results — unlike
  // ListenBrainz, this endpoint has no other mandatory parameter. `fields` and `limit` are
  // requested anyway to keep the payload small and bounded (an unrestricted query returns
  // every ISBN/edition/subject tag Open Library has for a work, which can run past 100
  // entries per book — verified live on "Patrick Rothfuss"/"The Name of the Wind").
  const query = new URLSearchParams({
    author: authorName,
    fields: 'key,title,author_name',
    limit: String(RESULTS_PER_SEED),
  });
  const url = `${deps.baseUrl}/search.json?${query.toString()}`;
  let response: Response;
  try {
    response = await deps.fetch(url);
  } catch (err) {
    deps.logger.warn(
      { err, authorName },
      'openlibrary: request failed, degrading to no candidates',
    );
    return [];
  }
  if (!response.ok) {
    deps.logger.warn(
      { status: response.status, authorName },
      'openlibrary: non-OK response, degrading to no candidates',
    );
    return [];
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    deps.logger.warn(
      { err, authorName },
      'openlibrary: response body was not JSON, degrading to no candidates',
    );
    return [];
  }
  const parsed = openLibrarySearchResponseSchema.safeParse(body);
  if (!parsed.success) {
    deps.logger.warn(
      { issues: parsed.error.issues, authorName },
      'openlibrary: response did not match the expected shape, degrading to no candidates',
    );
    return [];
  }
  return parsed.data.docs;
}

/**
 * Builds an `ExternalRecommendationProvider` for books, backed by Open Library's author
 * search. Takes an injected `fetch` — no network in unit tests, same rule every client in
 * this repo follows.
 */
export function createOpenLibraryProvider(
  deps: OpenLibraryProviderDeps,
): ExternalRecommendationProvider {
  const resolved = {
    fetch: deps.fetch,
    baseUrl: deps.baseUrl ?? DEFAULT_BASE_URL,
    logger: deps.logger ?? noopLogger,
  };

  return {
    providerName: OPENLIBRARY_PROVIDER_NAME,
    medium: 'book',
    async recommend(
      seeds: readonly RecommendationSeed[],
      limit = DEFAULT_LIMIT,
    ): Promise<ExternalCandidate[]> {
      const bookSeeds = seeds
        .filter((seed) => seed.label.trim().length > 0)
        .slice(0, MAX_SEEDS_QUERIED);
      if (bookSeeds.length === 0) return [];

      const results: ExternalCandidate[] = [];
      const seenWorkKeys = new Set<string>();

      for (const seed of bookSeeds) {
        const docs = await searchByAuthor(resolved, seed.label);

        for (const doc of docs) {
          const workKey = doc.key?.trim();
          const title = doc.title?.trim();
          if (!workKey || !title) continue;
          if (seenWorkKeys.has(workKey)) continue;
          seenWorkKeys.add(workKey);

          const authors = (doc.author_name ?? [])
            .map((name) => name?.trim())
            .filter((name): name is string => !!name);

          results.push({
            providerName: OPENLIBRARY_PROVIDER_NAME,
            providerId: workKey,
            medium: 'book',
            title,
            authors,
            genres: [],
            // Deliberately empty — see this file's header comment on why an Open Library
            // ISBN must never be threaded into `identifiers`.
            identifiers: {},
            reason: `Because you love ${seed.label}`,
          });

          if (results.length >= limit) return results;
        }
      }

      return results;
    },
  };
}

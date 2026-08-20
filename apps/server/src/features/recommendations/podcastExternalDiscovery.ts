/**
 * Wave 15e-podcasts: the bridge between iTunes' `ExternalCandidate`s and two things that
 * already exist — 15b-1's ownership matcher, and the wire shape `GET
 * /libraries/:id/recommended` already serves and both clients already parse (`LibraryItem[]`,
 * via `@auralis/abs-client`'s domain type). Mirrors `bookExternalDiscovery.ts`'s shape
 * exactly (adaptation only, no scoring change) but is its own file rather than a widened
 * export from that one — books and podcasts adapt from structurally different `Media`
 * variants (`media.authors: AuthorBadge[]` vs `media.author: string | null`), so a shared
 * file would need to branch on `media.kind` internally for no benefit; the one genuinely
 * medium-agnostic function, `externalCandidateToOwnershipItem`, is reused from
 * `musicExternalDiscovery.ts` rather than duplicated here (as `bookExternalDiscovery.ts`
 * already does).
 *
 * **Show-granularity ownership, not episode-granularity.** Audiobookshelf's `Podcast`
 * already carries `feedUrl` plus a flat `author` straight off the same `LibraryItem` pool
 * the route already fetches, so — like books, and unlike music's artist/album split — no
 * second upstream call and no second pool-building pass are needed: `pool.items` (already
 * fetched by the route for its own library-derived shelves) is filtered to `kind ===
 * 'podcast'` and reused directly.
 */

import type { LibraryItem } from '@auralis/abs-client';
import type { ExternalCandidate, RecommendationSeed } from './external/types.js';
import type { OwnershipLibraryItem } from './ownership.js';

/**
 * One real Audiobookshelf podcast -> one ownership-pool entry. Returns `null` for a book (or
 * anything else that isn't a podcast) rather than throwing — same total-function shape
 * `bookLibraryItemToOwnershipLibraryItem`'s own doc comment follows, and the caller filters
 * `null`s out identically.
 *
 * `identifiers.feedUrl` **is** populated here with the real, trusted Audiobookshelf value —
 * unlike `itunes.ts`'s candidate side, which deliberately leaves it unset (see that file's
 * header comment for why). Populating it only on the trusted library side, never on the
 * untrusted candidate side, means `ownership.ts`'s `comparePair` veto can never trigger for
 * this pairing today (the veto only fires when *both* sides declare the same field) while
 * still giving a future provider that can match feed URLs precisely (PodcastIndex, per
 * `docs/research/RECOMMENDATION_PROVIDERS.md` §4) something real to compare against.
 */
export function podcastLibraryItemToOwnershipLibraryItem(
  item: LibraryItem,
): OwnershipLibraryItem | null {
  if (item.media.kind !== 'podcast') return null;
  const author = item.media.author?.trim();
  return {
    id: item.id,
    title: item.media.title,
    authors: author ? [author] : [],
    identifiers: { feedUrl: item.media.feedUrl },
  };
}

/**
 * An `ExternalCandidate` has no cover, no episodes, no Jellyfin/Audiobookshelf item id — none
 * of `Podcast`'s real-library fields apply beyond title/author/genres. Every optional/
 * nullable field is left `null` (or its type's neutral default) rather than guessed, so a
 * client rendering this degrades honestly instead of showing fabricated data — the identical
 * convention `bookExternalDiscovery.ts`'s and `musicExternalDiscovery.ts`'s placeholder
 * functions both document. `id` is namespaced `external:<providerName>:<providerId>`, same
 * reasoning: never a bare `providerId` alone, so it can never collide with a real
 * Audiobookshelf item id space.
 *
 * `libraryId` takes the real library id the request was scoped to (`params.id` at the call
 * site) — `LibraryItem.libraryId` is non-optional, and every real item in the response
 * carries the same value, so a placeholder claiming a different one would be more surprising
 * than reusing it, even though this item exists in no library at all.
 */
export function externalCandidateToPodcastLibraryItemPlaceholder(
  candidate: ExternalCandidate,
  libraryId: string,
): LibraryItem {
  return {
    id: `external:${candidate.providerName}:${candidate.providerId}`,
    libraryId,
    addedAt: null,
    updatedAt: null,
    coverPath: null,
    size: 0,
    media: {
      kind: 'podcast',
      title: candidate.title,
      author: candidate.authors[0] ?? null,
      description: null,
      genres: candidate.genres,
      numEpisodes: 0,
      episodes: undefined,
      // Deliberately null, not the candidate's own feed URL — this is a display placeholder,
      // not a verified library entry, and `itunes.ts`'s candidate never sets `feedUrl` in
      // `identifiers` for the same reason (see that file's header comment). Surfacing an
      // unverified feed URL here would let a client offer to subscribe/play against a feed
      // this wave never confirmed resolves to the show shown.
      feedUrl: null,
    },
    progress: null,
  };
}

/**
 * The external-discovery shelf's single `reason` string — one per shelf, not per item, the
 * same shape `shelves.ts`'s library-derived shelves and `bookExternalDiscovery.ts`'s/
 * `musicExternalDiscovery.ts`'s external shelves all use. Distinct wording: this shelf's
 * candidates are "more shows in a genre she already listens to" (`itunes.ts`'s own header
 * comment explains why genre rather than publisher), so "New shows to discover" plus a genre
 * name reads naturally. Never asserted verbatim by a client test, same rule
 * `ExternalCandidate.reason`'s own doc comment states — copy is expected to change.
 */
export function reasonForPodcastExternalShelf(seedsUsed: readonly RecommendationSeed[]): string {
  const labels = seedsUsed.map((seed) => seed.label);
  if (labels.length === 0) return 'Podcasts to discover';
  if (labels.length === 1) return `Because you listen to ${labels[0]} podcasts`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `Because you listen to ${rest.join(', ')} and ${last} podcasts`;
}

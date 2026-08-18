/**
 * Wave 15e-books: the bridge between Open Library's `ExternalCandidate`s and two things
 * that already exist — 15b-1's ownership matcher, and the wire shape `GET
 * /libraries/:id/recommended` already serves and both clients already parse (`LibraryItem[]`,
 * via `@auralis/abs-client`'s domain type). Mirrors `musicExternalDiscovery.ts`'s shape
 * exactly (adaptation only, no scoring change) but is its own file rather than a widened
 * export from that one — books and music adapt from structurally unrelated real-library
 * entities (`LibraryItem` here, `Artist`/`Album` there), so a shared file would need to
 * branch on medium internally for no benefit; `externalCandidateToOwnershipItem`, the one
 * genuinely medium-agnostic function, is reused from that file rather than duplicated here.
 *
 * **Book-granularity ownership, not artist-granularity.** Unlike music (where ListenBrainz
 * recommends *artists* and the library's ownership pool had to be rebuilt from a second
 * entity type — see that file's header comment), `openlibrary.ts`'s candidates are already
 * individual works, and Audiobookshelf's `Book` already carries `isbn`/`asin` plus
 * `authors[].name` straight off the same `LibraryItem` pool the route already fetches. No
 * second upstream call and no second pool-building pass are needed — `pool.items` (already
 * fetched by the route for its own library-derived shelves) is filtered to `kind === 'book'`
 * and reused directly.
 */

import type { LibraryItem } from '@auralis/abs-client';
import type { ExternalCandidate, RecommendationSeed } from './external/types.js';
import type { OwnershipLibraryItem } from './ownership.js';

/**
 * One real Audiobookshelf book -> one ownership-pool entry. Returns `null` for a podcast
 * (or anything else that isn't a book) rather than throwing — `pool.items` mixes both media
 * kinds for a book library that also holds no podcasts in practice, but nothing here assumes
 * that; the caller filters `null`s out, the same total-function shape `ownership.ts`'s own
 * header comment asks every adapter in this feature to follow.
 */
export function bookLibraryItemToOwnershipLibraryItem(
  item: LibraryItem,
): OwnershipLibraryItem | null {
  if (item.media.kind !== 'book') return null;
  return {
    id: item.id,
    title: item.media.title,
    authors: item.media.authors.map((author) => author.name),
    identifiers: { asin: item.media.asin, isbn: item.media.isbn },
  };
}

/**
 * An `ExternalCandidate` has no cover, no narrator, no chapters, no Jellyfin/Audiobookshelf
 * item id — none of `Book`'s real-library fields apply. Every optional/nullable field is
 * left `null` (or its type's neutral default) rather than guessed, so a client rendering
 * this degrades honestly instead of showing fabricated data — the identical convention
 * `musicExternalDiscovery.ts`'s `externalCandidateToAlbumPlaceholder` documents for the
 * music side. `id` is namespaced `external:<providerName>:<providerId>`, same reasoning:
 * never a bare `providerId` alone, so it can never collide with a real Audiobookshelf item
 * id space, and a future route can recognise the prefix to special-case these ids.
 *
 * `libraryId` takes the real library id the request was scoped to (`params.id` at the call
 * site) — the field is non-optional on `LibraryItem` and every real item in the response
 * carries the same value, so a placeholder claiming a different one would be more surprising
 * than reusing it, even though this item exists in no library at all.
 */
export function externalCandidateToLibraryItemPlaceholder(
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
      kind: 'book',
      title: candidate.title,
      subtitle: null,
      authors: candidate.authors.map((name) => ({ name })),
      narrator: null,
      series: [],
      genres: candidate.genres,
      publishedYear: null,
      description: null,
      isbn: null,
      asin: null,
      duration: 0,
      tracks: undefined,
      chapters: undefined,
    },
    progress: null,
  };
}

/**
 * The external-discovery shelf's single `reason` string — one per shelf, not per item, the
 * same shape `shelves.ts`'s library-derived shelves and `musicExternalDiscovery.ts`'s
 * `reasonForExternalShelf` both use. Distinct wording from the music version: this shelf's
 * candidates are "more by an author she already loves" (`openlibrary.ts`'s own header
 * comment explains why), not "similar new artists", so "New authors to discover" would
 * misstate what the shelf actually contains. Never asserted verbatim by a client test, same
 * rule `ExternalCandidate.reason`'s own doc comment states — copy is expected to change.
 */
export function reasonForBookExternalShelf(seedsUsed: readonly RecommendationSeed[]): string {
  const labels = seedsUsed.map((seed) => seed.label);
  if (labels.length === 0) return 'Books to discover';
  if (labels.length === 1) return `Because you love ${labels[0]}`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `Because you love ${rest.join(', ')} and ${last}`;
}

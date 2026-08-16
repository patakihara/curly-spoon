/**
 * Wave 15b: the ownership matcher. Decides whether an externally-recommended
 * title (a catalogue entry, not a `RecommendationCandidate`) is something the
 * user already owns. Pure, I/O-free, total — no network, no DB, no clock, no
 * randomness, never throws.
 *
 * This is *not* wired into any route. It is the pure core only; a later wave
 * (15c/15d) is the caller that adapts real library items and real provider
 * results into `OwnershipItem`/`OwnershipLibraryItem` and does something with
 * the verdict (rendering "not requestable", persisting a mapping, etc).
 *
 * The identifiers this module reads were carried through by wave 15a-0
 * (`docs/ROADMAP.md` §15a-0): `Book.asin`/`isbn`, `Podcast.feedUrl`,
 * `PodcastEpisode.guid`, `Artist.musicBrainzArtistId`,
 * `Album.musicBrainzAlbumId`/`musicBrainzReleaseGroupId`,
 * `Track.musicBrainzTrackId`. A caller adapts whichever of those a given
 * candidate/library item actually carries into `OwnershipIdentifiers` —
 * exactly the same "adapted shape, not the raw domain type" pattern
 * `RecommendationCandidate` already uses (see `types.ts`).
 */

/**
 * Every strong identifier this matcher knows how to compare, one field per
 * upstream id. All optional/nullable because a real item usually carries at
 * most one or two of these (a book has `asin`/`isbn`; an album has the two
 * MusicBrainz fields; nothing has all eight).
 *
 * Deliberately **not** a single generic `{ namespace: string; value: string
 * }[]` — a fixed field per id keeps a caller from accidentally putting an
 * ASIN under the `isbn` key (or vice versa) at the call site, which a stringly
 * namespaced bag would not catch until this module ran. Namespacing happens
 * inside `identifierEntries` below, once, in one place.
 */
export interface OwnershipIdentifiers {
  /** Audiobookshelf `Book.asin`. */
  asin?: string | null;
  /** Audiobookshelf `Book.isbn`. */
  isbn?: string | null;
  /** Audiobookshelf `Podcast.feedUrl` — the show's own RSS feed, not an episode's. */
  feedUrl?: string | null;
  /** Audiobookshelf `PodcastEpisode.guid` — one specific episode's RSS `<guid>`. */
  guid?: string | null;
  /** Jellyfin `Artist.musicBrainzArtistId`. */
  musicBrainzArtistId?: string | null;
  /** Jellyfin `Album.musicBrainzAlbumId` — a specific release. */
  musicBrainzAlbumId?: string | null;
  /** Jellyfin `Album.musicBrainzReleaseGroupId` — ties editions/pressings together. */
  musicBrainzReleaseGroupId?: string | null;
  /** Jellyfin `Track.musicBrainzTrackId`. */
  musicBrainzTrackId?: string | null;
}

const IDENTIFIER_FIELDS = [
  'asin',
  'isbn',
  'feedUrl',
  'guid',
  'musicBrainzArtistId',
  'musicBrainzAlbumId',
  'musicBrainzReleaseGroupId',
  'musicBrainzTrackId',
] as const satisfies readonly (keyof OwnershipIdentifiers)[];

export type OwnershipIdentifierField = (typeof IDENTIFIER_FIELDS)[number];

/**
 * The namespace prefix each identifier field is compared under — the same
 * `namespace:value` house pattern `shelves.ts`'s `parentKeyOf` uses for
 * parent keys. This is what makes "a book id and a podcast id that happen to
 * share a string" a non-match: they are namespaced under different prefixes
 * (`asin:` vs `feed:`) even though the field values could theoretically
 * collide as bare strings.
 */
const IDENTIFIER_NAMESPACE: Record<OwnershipIdentifierField, string> = {
  asin: 'asin',
  isbn: 'isbn',
  feedUrl: 'feed',
  guid: 'guid',
  musicBrainzArtistId: 'mbid-artist',
  musicBrainzAlbumId: 'mbid-album',
  musicBrainzReleaseGroupId: 'mbid-release-group',
  musicBrainzTrackId: 'mbid-track',
};

/** An item on either side of the match: an external candidate, or a library item. */
export interface OwnershipItem {
  title: string;
  /** Already folded to one array by the caller — a `Podcast`'s flat
   * `author: string | null` must become a one-element array before it
   * reaches this module, same adaptation `RecommendationCandidate`'s own doc
   * comment requires. Empty is fine (`[]`), never throws. */
  authors: string[];
  identifiers: OwnershipIdentifiers;
}

/** A library-side item — same shape as `OwnershipItem`, plus the id a verdict
 * can point back to (so a caller can look the matched item up, or persist a
 * request-time provider-id → library-id mapping later). */
export interface OwnershipLibraryItem extends OwnershipItem {
  id: string;
}

/** Why a verdict landed where it did — lets a caller (and a future debugger)
 * tell a strong identifier match from a weak title/author heuristic apart,
 * rather than trusting a bare `'owned'` string. */
export type OwnershipMatchReason =
  | {
      kind: 'identifier';
      /** Which identifier field matched, and its (raw, un-namespaced) value. */
      field: OwnershipIdentifierField;
      value: string;
    }
  | {
      /** Same normalized title, overlapping (or both-empty) author list, no
       * identifier confirmed or denied it either way. */
      kind: 'title-author';
    };

/**
 * The three outcomes, kept genuinely distinct (see this module's header
 * comment and `docs/ROADMAP.md` §15b) — `possible` must never be silently
 * folded into `owned` or `new`.
 *
 * - **`owned`** — matched a library item on a strong, namespaced identifier.
 *   Renders as a normal result; **not requestable**.
 * - **`possible`** — a near-match (same normalized title + overlapping
 *   authors) with no identifier confirming *or* denying it. **Caller
 *   guidance:** treat exactly like `owned` for requestability — never offer a
 *   request action for something she probably already has, since a false
 *   `new` (silently offering a request for an owned title) is harmless
 *   annoyance while a false `owned`/`possible` from an over-eager title match
 *   only *hides* a request option, which is also recoverable by browsing to
 *   the item directly. What `possible` must NOT do is disappear into `owned`
 *   at the type level — a later wave (15c/15d) needs to flag it distinctly
 *   (e.g. a different card treatment, or a queue entry) so a human can
 *   resolve it definitively instead of the ambiguity being silently eaten.
 * - **`new`** — no match by any means. Requestable.
 */
export type OwnershipVerdict =
  | { status: 'owned'; libraryItemId: string; reason: OwnershipMatchReason }
  | { status: 'possible'; libraryItemId: string; reason: OwnershipMatchReason }
  | { status: 'new' };

/**
 * Case-fold and trim, nothing more. **Deliberately conservative** — see this
 * module's header. Stripping subtitles, punctuation, leading articles ("The
 * Hobbit" → "Hobbit"), or edition/narrator suffixes would each *increase*
 * how often two genuinely different titles fold together, and a false
 * `owned`/`possible` from that is the dangerous direction: it silently
 * removes a title she could have requested, and nothing downstream notices
 * because the item just doesn't show up as requestable. A missed match
 * (false `new`) is the safe failure — worst case she sees a request button
 * for something she already owns, which is a harmless, visible annoyance.
 * `ownership.test.ts` pins a title pair (differing only by subtitle) that
 * must NOT match, specifically to keep a future "improvement" honest.
 */
function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Same case-fold-and-trim policy as `normalizeTitle`, for author-name comparison. */
function normalizeAuthor(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Authors "match" if the two lists share at least one normalized name, or if
 * both are empty. The empty/empty case exists because some media kinds this
 * module's callers adapt (e.g. an artist, or a podcast with `author: null`)
 * may legitimately carry no author at all — without it, nothing with an
 * empty author list could ever reach `possible`, even on an exact title
 * match, which is too strict for those kinds. It never reaches `owned` on
 * its own regardless: title/author agreement alone is always `possible`,
 * never `owned` (see `comparePair`).
 */
function authorsOverlap(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  const bNormalized = new Set(b.map(normalizeAuthor));
  return a.some((name) => bNormalized.has(normalizeAuthor(name)));
}

/**
 * Namespaced `prefix:value` keys for every identifier a real (non-null,
 * non-empty) value is present for. `value` is trimmed but **not** case-folded
 * — unlike titles/authors, an identifier is compared for exact equality only
 * (conservative in the same direction as `normalizeTitle`: under-matching an
 * identifier just falls through to the title heuristic or `new`, never to a
 * false `owned`).
 */
function identifierEntries(
  identifiers: OwnershipIdentifiers,
): { field: OwnershipIdentifierField; key: string; value: string }[] {
  const entries: { field: OwnershipIdentifierField; key: string; value: string }[] = [];
  for (const field of IDENTIFIER_FIELDS) {
    const raw = identifiers[field];
    if (raw == null) continue;
    const value = raw.trim();
    if (value.length === 0) continue;
    entries.push({ field, key: `${IDENTIFIER_NAMESPACE[field]}:${value}`, value });
  }
  return entries;
}

type PairVerdict =
  | { status: 'owned'; reason: OwnershipMatchReason }
  | { status: 'possible'; reason: OwnershipMatchReason }
  | { status: 'no-match' };

/**
 * Compares one external candidate against one library item. Identifier
 * agreement always wins outright; an identifier field present and differing
 * on both sides vetoes what would otherwise be a title/author `possible`
 * match for this specific pair — "different edition" reads as `no-match`
 * here, which lets the caller in `matchOwnership` fall through to `new`
 * rather than reporting a false `possible`.
 */
function comparePair(candidate: OwnershipItem, libraryItem: OwnershipLibraryItem): PairVerdict {
  const candidateIds = identifierEntries(candidate.identifiers);
  const libraryIds = identifierEntries(libraryItem.identifiers);

  let contradicted = false;
  for (const candidateId of candidateIds) {
    const libraryId = libraryIds.find((entry) => entry.field === candidateId.field);
    if (!libraryId) continue;
    if (libraryId.key === candidateId.key) {
      // Strong identifier match: beats title matching outright, always.
      return {
        status: 'owned',
        reason: { kind: 'identifier', field: candidateId.field, value: candidateId.value },
      };
    }
    // Same field present on both sides, different value: a different edition.
    // Never let a title heuristic override this negative id match.
    contradicted = true;
  }

  if (contradicted) return { status: 'no-match' };

  const titleMatches = normalizeTitle(candidate.title) === normalizeTitle(libraryItem.title);
  const authorsMatch = authorsOverlap(candidate.authors, libraryItem.authors);
  if (titleMatches && authorsMatch) {
    return { status: 'possible', reason: { kind: 'title-author' } };
  }

  return { status: 'no-match' };
}

/**
 * Classifies `candidate` against the user's library. Total: an empty
 * `library`, a `candidate` with no identifiers and no authors, and a blank
 * title all degrade to a sensible verdict rather than throwing.
 *
 * First identifier match found wins outright and returns immediately
 * (`owned`) — identifier agreement never needs to be weighed against
 * anything else. Otherwise the first `possible` pairing found is returned;
 * with none, `new`.
 */
export function matchOwnership(
  candidate: OwnershipItem,
  library: readonly OwnershipLibraryItem[],
): OwnershipVerdict {
  let possibleMatch: { libraryItemId: string; reason: OwnershipMatchReason } | null = null;

  for (const libraryItem of library) {
    const pair = comparePair(candidate, libraryItem);
    if (pair.status === 'owned') {
      return { status: 'owned', libraryItemId: libraryItem.id, reason: pair.reason };
    }
    if (pair.status === 'possible' && possibleMatch === null) {
      possibleMatch = { libraryItemId: libraryItem.id, reason: pair.reason };
    }
  }

  if (possibleMatch) {
    return {
      status: 'possible',
      libraryItemId: possibleMatch.libraryItemId,
      reason: possibleMatch.reason,
    };
  }

  return { status: 'new' };
}

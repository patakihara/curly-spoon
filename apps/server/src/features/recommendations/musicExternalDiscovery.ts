/**
 * Wave 15e-music: the bridge between ListenBrainz's `ExternalCandidate`s and two things
 * that already exist — 15b-1's ownership matcher, and the wire shape `GET
 * /music/recommended` already serves and both clients already parse (`Album[]`, via
 * `packages/jellyfin-client`'s domain type). Nothing here is a scoring change: it is pure
 * adaptation, the same "adapted shape, not the raw domain type" pattern
 * `RecommendationCandidate`/`ExternalCandidate` already document.
 *
 * **Why artist granularity closes a real gap.** `docs/HANDOVER.md` names it plainly: the
 * music ownership pool `routes/jellyfin.ts` already builds is **albums**
 * (`Album.musicBrainzAlbumId`/`musicBrainzReleaseGroupId`), but ListenBrainz's tier-1
 * `lb-radio` endpoint recommends at **artist** granularity (no track title in its response
 * at all — see `external/listenbrainz.ts`'s header comment). An album-keyed pool can never
 * match an artist-keyed candidate, so every recommended artist would look "new" even when
 * the user owns that artist's entire discography. `artistToOwnershipLibraryItem` below is
 * what closes that: a second ownership pool, built from `Artist[]` (already fetched via
 * `JellyfinClient.getArtists()`), keyed the same way `ownership.ts` keys everything else —
 * `Artist.musicBrainzArtistId` first, a normalized-title/empty-author fallback only when
 * one side lacks an MBID.
 *
 * **The fallback is deliberately weak, and that is documented, not hidden.** Real-world
 * Jellyfin libraries are dominated by libraries where the scanner never found a
 * MusicBrainz match (`docs/HANDOVER.md`'s own "Jellyfin music metadata" note: ffprobe's ID3
 * genre tags lie, and provider-id population depends entirely on the scanner's own match
 * quality). Where neither side carries an MBID, this falls through to `ownership.ts`'s
 * title/author heuristic — the same conservative, false-`new`-favouring policy that module's
 * own header comment already argues for, extended here rather than replaced: matching
 * artist names as bare strings is exactly the kind of matching this project has been burned
 * by before (`docs/HANDOVER.md`'s "minified-item bug"), so this file adds nothing sharper
 * than `ownership.ts` already provides — it only supplies artist-shaped inputs to it.
 */

import type { Album, Artist } from '@auralis/jellyfin-client';
import type { ExternalCandidate, RecommendationSeed } from './external/types.js';
import type { OwnershipItem, OwnershipLibraryItem } from './ownership.js';

/**
 * One real Jellyfin artist -> one ownership-pool entry. `authors: []` — an artist has no
 * separate "author" concept, the same reasoning `ownership.ts`'s `authorsOverlap` doc
 * comment gives for why empty/empty is allowed to reach `possible`: without it, no artist
 * (owned or external) could ever match on title alone, even an exact one.
 */
export function artistToOwnershipLibraryItem(artist: Artist): OwnershipLibraryItem {
  return {
    id: artist.id,
    title: artist.name,
    authors: [],
    identifiers: { musicBrainzArtistId: artist.musicBrainzArtistId },
  };
}

/** One `ExternalCandidate` -> the shape `matchOwnership` compares against a library pool.
 * `ExternalCandidate.identifiers` already reuses `OwnershipIdentifiers` (see that type's own
 * doc comment on why), so this is a field-for-field lift, never a re-derivation. */
export function externalCandidateToOwnershipItem(candidate: ExternalCandidate): OwnershipItem {
  return {
    title: candidate.title,
    authors: candidate.authors,
    identifiers: candidate.identifiers,
  };
}

/**
 * An `ExternalCandidate` has no cover art, no track count, no Jellyfin item id — none of
 * `Album`'s real-library fields apply. Every optional/nullable `Album` field is left `null`
 * (or its type's neutral default) rather than guessed, so a client rendering this object
 * degrades honestly (no image, no year, no track count) instead of showing fabricated data.
 * `id` is namespaced `external:<providerName>:<providerId>` — deliberately never a bare
 * `providerId` alone, so it can never collide with a real Jellyfin item id space, and a
 * future route can recognise the prefix to special-case these ids (e.g. refuse to try
 * `GET /jellyfin/albums/:id` against one). Browsing into one of these cards is out of this
 * wave's scope; see this file's own report for what that leaves unresolved.
 */
export function externalCandidateToAlbumPlaceholder(candidate: ExternalCandidate): Album {
  return {
    id: `external:${candidate.providerName}:${candidate.providerId}`,
    name: candidate.title,
    sortName: null,
    artistId: null,
    artistName: null,
    productionYear: null,
    overview: null,
    genres: candidate.genres,
    imageTag: null,
    trackCount: null,
    favorite: false,
    playCount: 0,
    lastPlayedAt: null,
    musicBrainzAlbumId: null,
    musicBrainzReleaseGroupId: null,
  };
}

/**
 * The external-discovery shelf's single `reason` string (`RecommendationShelf`/
 * `MusicRecommendedShelf` carry one `reason` per shelf, not per item — the same shape the
 * library-derived shelves already use, see `shelves.ts`'s `reasonFor`). `seedsUsed` is
 * whichever seeds a caller actually queried a provider with, in label order; this never
 * repeats `ExternalCandidate.reason` (which is provider-specific, per-candidate phrasing —
 * `external/types.ts`'s own doc comment already warns a client test must never assert that
 * text verbatim, and shelf-level copy is exactly as changeable). Total: an empty list
 * degrades to a generic line rather than an empty/malformed sentence.
 */
export function reasonForExternalShelf(seedsUsed: readonly RecommendationSeed[]): string {
  const labels = seedsUsed.map((seed) => seed.label);
  if (labels.length === 0) return 'New artists to discover';
  if (labels.length === 1) return `Because you listen to ${labels[0]}`;
  const last = labels[labels.length - 1];
  const rest = labels.slice(0, -1);
  return `Because you listen to ${rest.join(', ')} and ${last}`;
}

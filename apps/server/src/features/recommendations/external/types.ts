/**
 * Wave 15a: the external-candidate seam. `RecommendationCandidate` (`../types.ts`) is an
 * adapted shape **over library items** — it has no way to represent a catalogue entry the
 * user does not own. This file is that representation, plus the pluggable per-medium
 * provider interface that produces it.
 *
 * Precedent: phase 9's request-provider registry (`apps/server/src/requests/indexers/`,
 * `.../music/`) — "the provider interface is pluggable, so a new provider is a new file, not
 * a refactor." This follows the same shape: an interface, a per-provider implementation
 * file, and a registry mapping a provider name to a factory (`registry.ts`).
 *
 * **`ExternalCandidate` is deliberately not `RecommendationCandidate`.** Phase 13's mistake
 * was building a scorer over items already in the library and calling it "recommendations" —
 * conflating "a thing we can rank" with "a thing the user owns". Structurally assigning an
 * `ExternalCandidate` where a `RecommendationCandidate` is expected (or vice versa) would
 * repeat that shape of mistake at the type level. Any future wave that needs to rank both
 * kinds together does so through an explicit adapter function, not a shared interface.
 */

import type { OwnershipIdentifiers } from '../ownership.js';

export type ExternalMedium = 'book' | 'podcast' | 'music';

/**
 * A catalogue entry from an external provider — something the user may or may not already
 * own. Ownership itself is **not** a field here: whether a given candidate is already in the
 * library is `ownership.ts`'s job (wave 15b), computed by comparing `identifiers`/`title`/
 * `authors` against the real library, not asserted by the provider that found it.
 *
 * The fields below are chosen to satisfy two things at once: `ownership.ts`'s
 * `OwnershipItem` (so a caller can build one with no further adaptation beyond picking
 * `title`/`authors`/`identifiers` straight off this object), and the vendored `MediaCard`
 * design (`docs/design/sonora/components/MediaCard.dc.html`), which needs a title, a
 * subtitle-worthy medium name, and (once 15b runs) an owned/absent status to render the
 * "Not in library" pill on a mixed shelf.
 */
export interface ExternalCandidate {
  /**
   * Which provider produced this candidate — the same string as that provider's
   * `providerName` (see `ExternalRecommendationProvider` below) and the key it is registered
   * under in `registry.ts`. Kept as a plain string, not a closed union, so a second provider
   * for a medium (§15e names ListenBrainz tier 2, Audnexus, PodcastIndex as future files) is
   * a new file and a new registry entry, never an edit to this type.
   */
  providerName: string;
  /**
   * The provider's own catalogue id for this item — opaque to everything downstream except
   * that provider. **Not** one of `identifiers`: those are the shared, namespaced ids
   * (MBID/ASIN/feed GUID/…) `ownership.ts` compares across providers and the library, and a
   * provider's private key is not guaranteed to be any of them (ListenBrainz's is already an
   * MBID and so happens to also appear in `identifiers`; a future provider's might not be).
   * Kept distinctly so a later wave (15b-2, currently blocked — see `ROADMAP.md` §15) can
   * persist "this provider's id for this item maps to this library item" without re-deriving
   * which of the eight identifier fields was the operative one.
   */
  providerId: string;
  medium: ExternalMedium;
  title: string;
  /**
   * Folded to one array up front, same convention `OwnershipItem.authors` already documents
   * (an author list for a book, one name for a podcast host once folded, `[]` for a bare
   * artist/album candidate that has no separate "author"). This is what makes handing an
   * `ExternalCandidate`'s `title`/`authors`/`identifiers` straight into an `OwnershipItem`
   * require no further adaptation.
   */
  authors: string[];
  genres: string[];
  /**
   * The cross-provider identifiers this candidate is known to carry. Reuses
   * `ownership.ts`'s fixed-field `OwnershipIdentifiers` bag rather than a parallel
   * `{ namespace, value }[]` scheme — that file's own header comment explains why a stringly
   * namespaced bag is the wrong shape (a caller could put an ASIN under the `isbn` key and
   * nothing would catch it until match time). Whichever fields a given medium doesn't carry
   * stay unset; nothing here requires all eight.
   */
  identifiers: OwnershipIdentifiers;
  /**
   * One line of "why", provider-specific phrasing kept inside the provider (e.g. "Similar to
   * <seed artist>"). Never assert exact reason text in a client test once this reaches one —
   * `shelves.ts`'s own `reason` field carries the identical rule, recorded in
   * `docs/HANDOVER.md`, and the copy is expected to change.
   */
  reason: string;
}

/**
 * One piece of "what she likes" to seed a provider's query — deliberately narrower than the
 * full `TasteProfile` (`../types.ts`). `TasteProfile` is this feature's internal
 * library-derived shape and wiring it into an external HTTP call is real work for whichever
 * wave actually builds a shelf from these candidates (15c/15e) — it has to decide *which*
 * affinities become seeds, in what order, and how many. This wave only needs a shape a
 * provider can act on and a test can construct without reaching into `TasteProfile` at all.
 */
export interface RecommendationSeed {
  /**
   * **The bare display name of the seed itself** — an artist, author or show name, e.g.
   * `"Radiohead"`. Never a phrase built around it (not `"you listen to Radiohead"`): a
   * provider is free to fold this into its own `reason` string however it likes (ListenBrainz's
   * provider builds `` `Similar to ${label}` ``), and a phrase-shaped label would compose into
   * "Similar to you listen to Radiohead" on a rendered card. Never asserted verbatim by a
   * client test for the same reason `ExternalCandidate.reason` isn't — only this contract on
   * its shape is enforced, here, in prose.
   */
  label: string;
  /**
   * Whichever identifiers are known for the seed. A provider reads only the fields it
   * understands (ListenBrainz's tier-1 endpoint needs `musicBrainzArtistId`; a book provider
   * would read `asin`) and ignores the rest — never throws on an unrecognised or absent
   * field, since seeds commonly carry at most one or two identifiers.
   */
  identifiers: OwnershipIdentifiers;
}

/**
 * A source of `ExternalCandidate`s for one medium. `search`/`recommend` here is total: an
 * unreachable provider, a rate limit, or an unparseable response must degrade to `[]`
 * (optionally after logging), never throw and never take down whatever calls it. Mirrors the
 * `IndexerProvider`/`MusicSearchProvider` degrade-on-empty convention in
 * `apps/server/src/requests/types.ts`, but stricter — those may throw a `ProviderError` for a
 * genuine outage; this may not, because a recommendation is enrichment for a page that must
 * render regardless (the same "optional enrichment degrades silently" shape
 * `tryBuildMusicGenreProfile` in `routes/libraries.ts` already uses for the cross-media
 * profile merge).
 */
export interface ExternalRecommendationProvider {
  readonly providerName: string;
  readonly medium: ExternalMedium;
  /**
   * `seeds` are tried in order; a provider unable to use a given seed's identifiers (e.g. a
   * music provider handed a seed with only an `asin`) simply skips it rather than failing the
   * call. `limit` bounds the returned array; omitted, a provider applies its own sensible
   * default. Never rejects — see this interface's own doc comment above.
   */
  recommend(seeds: readonly RecommendationSeed[], limit?: number): Promise<ExternalCandidate[]>;
}

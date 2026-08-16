# External recommendation providers — one medium at a time (phase 15)

Investigated 2026-08-16 against commit `d3a7d28`. No implementation in this document; it is
the provider survey `ROADMAP.md` §15 (wave 15a) needs before a provider is chosen. Research
only — no product code touched.

## 0. The correction this document exists to make

`docs/research/MUSIC_STREAMING_VS_ACQUISITION.md` argued against a NewPipeExtractor-based
source partly on the grounds that "it only ever addresses music... a NewPipeExtractor source
covers at most one [medium]." The user rejected that reasoning directly:

> _"it doesn't matter to me whether we use NewPipe or not, so long as we use **something**, but
> 'music-only' is a very silly counterargument here. Why would the recommendation services for
> the THREE different kinds of content we have be the same? that's not an expectation i have."_

**One provider per medium is the expected design, not a compromise.** A provider being
music-only is not a mark against it. That framing was an error and is not repeated here — each
medium below is surveyed and recommended independently, with no requirement that any candidate
also cover the other two.

**Consequence for the prior note's reliability.** Because it was framed as "is NewPipe the
answer for decision 1," it never surveyed music recommendation services on their own merits.
Notably absent: **ListenBrainz**, which unlike MusicBrainz (its own sister project, a pure
catalogue) is an actual recommendation service with a plain HTTP API and no JVM dependency —
covered in §1 below. **Its NewPipeExtractor-specific technical findings survive intact** and are
not re-derived here:

- JVM/Java-only, no trustworthy TypeScript port (`newpipe-extractor-js` on npm claims a GitHub
  repo that returns 404 and has a single unverifiable maintainer — treat as untrustworthy).
- `StreamExtractor.getRelatedItems()` is per-item "related videos," not a personalised feed —
  the ecosystem's own apps (ViMusic, InnerTune/Metrolist) migrated **off** NewPipeExtractor for
  YouTube-Music-shaped discovery specifically because it is the wrong tool for that.
- Real, ongoing brittleness tax as YouTube changes its scraping surface (SABR enforcement,
  integrity checks) — not a one-time integration cost.
- Streaming (playback of unowned tracks) and recommendation (deciding what to surface) are
  different product surfaces; a NewPipeExtractor-based **streaming** backend remains a
  legitimate, separate, Android-only future spike, unrelated to which provider answers decision
  1's discovery question.

What survives is **"NewPipeExtractor is a poor recommendation source and a JVM-only,
Android-only playback idea"** — not "NewPipe is wrong because it's music-only." The latter is
withdrawn.

---

## 1. What already exists to feed a provider

Before surveying providers, what signal Auralis already computes matters — a provider is only
as useful as what can be handed to it. Grepped from
`apps/server/src/features/recommendations/`:

- `buildTasteProfile()` (`profile.ts`) produces a `TasteProfile` whose `affinities` are
  **plain name strings**, not stable ids: `Record<AffinityKind, Record<string, number>>` where
  `AffinityKind` is `'genre' | 'author' | 'narrator' | 'series'`, keyed by e.g. `"Fantasy"` or
  `"Brandon Sanderson"`, weighted by listening/reading signal. `facetSeeds` maps each facet back
  to the strongest library item that produced it.
- `albumToCandidate()`/`buildMusicProgressSignals()` (`adaptMusic.ts`) fold Jellyfin album/play
  data into the same shape — genre affinity crosses media via `crossMediaGenre.ts`.
- **No provider-native identifier survives normalization today, for any medium**, verified by
  grep:
  - `packages/abs-client/src/domain.ts`'s `Book` exposes `isbn: string | null` but **no `asin`**
    field, even though `schemas/raw.ts` parses `asin` off the wire (`asin: z.string().nullable()
.optional()`) — it is read and then dropped before reaching the domain type. An Audnexus
    match (ASIN-keyed) would need that field surfaced first.
  - `packages/abs-client/src/domain.ts`'s `Podcast` exposes only `title`, `author`,
    `description`, `genres`, `numEpisodes`, `episodes[]` — **no feed URL, no GUID at all.**
    Audiobookshelf's own podcast metadata does carry a feed URL in its raw shape; it is simply
    never normalized through to this type. Matching against PodcastIndex/Listen Notes (both
    feed-URL/GUID-keyed) needs that added first.
  - `packages/jellyfin-client/src/schemas/raw.ts` has **no `ProviderIds` parsing at all** —
    grepped, zero hits. Jellyfin's own API commonly carries `MusicBrainzArtist`/`Album`/`Track`
    provider ids on items tagged via Picard, but Auralis's client never reads them. A
    MusicBrainz/ListenBrainz match today would have to go by artist/album **name**, not MBID.

**This is the same shape of gap as the minified-item bug documented in `HANDOVER.md`: a stable
identifier exists upstream and Auralis's own normalization layer drops it before anything
downstream could use it.** Surfacing these three fields (ASIN, podcast feed URL/GUID, Jellyfin
`ProviderIds`) is cheap, additive, and is a real prerequisite for 15b's identity/dedupe work
regardless of which provider is chosen per medium — recorded here so 15a/15b do not rediscover
it.

---

## 2. Music

### Candidates surveyed

| Provider                                  | Recommender or catalogue?                                                                                                                                | Personalises?                                                                                                                                               | Auth/cost                                                                   | Runtime fit                                            | Identity mapping                                            | Liveness                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **ListenBrainz** (`api.listenbrainz.org`) | **Recommender**, two tiers — see below                                                                                                                   | Yes, both tiers, differently                                                                                                                                | Public tier: none. Personal-CF tier: needs the user's own LB account        | Plain HTTP/JSON, TS-native, no JVM                     | **MBIDs** — exact match to MusicBrainz identity             | Actively developed (MetaBrainz Foundation; 2026 GSoC listing live)                                                         |
| **Last.fm**                               | **Recommender** (`track.getSimilar`, `artist.getSimilar`) — collaborative, from real listening data                                                      | Only via `user.getRecommendedTracks`, which needs a Last.fm-linked account                                                                                  | Free API key, instant signup, non-commercial; 5 req/s/IP                    | Plain HTTP/JSON, TS-native                             | Weak — Last.fm ids, MBID sometimes present but inconsistent | Active but declining scrobbler base; a 2009-era acquisition history and no confirmed current investment in the API surface |
| **MusicBrainz**                           | **Catalogue only** — confirmed by its own scope; ListenBrainz is the sister project that does recommendation                                             | No                                                                                                                                                          | Free, 1 req/s/IP (enforced), `musicbrainz-api` npm client throttles for you | Plain HTTP/JSON, TS-native                             | **Is** the identity layer (MBIDs)                           | Stable, foundational                                                                                                       |
| **Deezer public API**                     | **Catalogue-adjacent**, not a true recommender for our purposes — `GET /artist/{id}/related` returns Deezer's own "fans also like" list, unauthenticated | No — that's Deezer's algorithm's global answer per artist, not user-taste-conditioned; true personalised recs need OAuth into a Deezer _user's own account_ | Public catalogue endpoints (search, artist, related) need no auth at all    | Plain HTTP/JSON, TS-native                             | Deezer's own numeric ids; no MBID bridge documented         | Actively run (major streaming service)                                                                                     |
| **Spotify Web API**                       | Was a recommender; **`GET /v1/recommendations` was permanently deprecated for apps created after 2024-11-27** (403)                                      | N/A — dead for any app registered after that date                                                                                                           | OAuth, and the exact endpoint decision 1 would want is gone                 | N/A                                                    | Spotify ids; no MBID bridge                                 | Actively run, but this specific surface is deliberately killed                                                             |
| **NewPipeExtractor**                      | Coarse catalogue-adjacent signal only — see §0                                                                                                           | No                                                                                                                                                          | No key, but JVM-only                                                        | **Poor** — JVM/Android-only, breaks web/Android parity | None (YouTube video ids)                                    | Maintained but under real scraping-brittleness pressure                                                                    |

### ListenBrainz in detail — the finding the prior note missed

Source: [ListenBrainz API docs](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html)
(fetched 2026-08-16), [troi ListenBrainz elements](https://troi.readthedocs.io/en/latest/elements/listenbrainz.html)
(fetched 2026-08-16), [troi-recommendation-playground README](https://github.com/metabrainz/troi-recommendation-playground)
(fetched 2026-08-16).

ListenBrainz splits cleanly into **two usable tiers**, and only one of them needs an account:

1. **Public, MBID-seeded similarity — no account needed.** `GET /1/lb-radio/artist/(seed_mbid)`
   takes a MusicBrainz artist MBID and returns similar artists plus recordings, drawn from
   ListenBrainz's aggregate collaborative-filtering dataset across all its users — not the
   caller's own listening history. No token documented as required. This is a **real
   recommender** (derived from real cross-user listening co-occurrence, not a static "same
   genre" catalogue join), and it needs nothing from our user beyond an artist MBID — which
   Auralis's own taste profile could supply once artist names are resolved to MBIDs (via
   MusicBrainz search, since Jellyfin's `ProviderIds` are not currently parsed — §1). This tier
   is the one to build first.
2. **Personal collaborative-filtering recommendations — needs the user's own account.**
   `UserRecordingRecommendationsElement` (via `troi`, or the equivalent
   `GET /1/user/(username)/recommendation/...` REST surface) returns recordings personalised to
   a specific ListenBrainz **username**, computed from listens that user has actually submitted.
   This is meaningfully better — genuinely conditioned on _her_ taste, not just "fans of artist
   X" — but it requires her to (a) create a ListenBrainz account and (b) get her Jellyfin
   listening submitted to it, most plausibly via a Jellyfin ListenBrainz plugin (not
   investigated here — out of scope for this survey, worth a follow-up if tier 1 proves the
   mechanism is worth the extra investment).

**Flag for her, per the escalation rule below: tier 2 needs an account she must personally
create.** Tier 1 needs nothing from her at all and is the recommended starting point.

### Recommendation: **ListenBrainz, tier 1 (`lb-radio` artist-seeded) first**

Reasoning: it is the only music candidate that is simultaneously (a) a genuine recommender, not
a catalogue join, (b) usable with zero credential from the user, (c) plain TypeScript-reachable
HTTP with no JVM dependency, and (d) keyed on MBIDs — the identifier MusicBrainz itself defines
and the one identity system this survey trusts most (see §5). Deezer's `related` endpoint is a
credible fallback with an even lower integration bar (no MBID resolution needed, just a Deezer
artist search), but it is _Deezer's_ per-artist "fans also like" list, not conditioned on
anything about our user, and has no clean identifier bridge back to what Jellyfin knows. Last.fm
is a close second on capability but a weaker liveness bet. Spotify's relevant endpoint is simply
gone for any app in this project's registration window. NewPipeExtractor is ruled out per §0.

---

## 3. Audiobooks / books

### Candidates surveyed

| Provider                            | Recommender or catalogue?                                                                                                                                                                                                                                                                                                                                                                              | Personalises?                                                       | Auth/cost                                                  | Runtime fit                  | Identity mapping                                                                                 | Liveness                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audnexus** (`api.audnex.us`)      | **Catalogue only** — ASIN-keyed metadata (author/series/narrator/chapters), aggregated from Audible via the `mkb79` library. No "recommended for you" surface.                                                                                                                                                                                                                                         | No                                                                  | No key documented; ~100 req/min/source                     | Plain HTTP/JSON, TS-native   | **ASIN** — the same identity layer Audiobookshelf itself already depends on for Audible metadata | Active (2,481+ commits per `docs/INTEGRATIONS.md`'s existing research)                                                                                                                                                                              |
| **AudiMeta** (Vito0912 fork)        | Same as Audnexus — catalogue, not a recommender; exists to patch Audnexus's reliability gaps (500s, missing series descriptions, region 404s)                                                                                                                                                                                                                                                          | No                                                                  | Same shape as Audnexus                                     | Same                         | Same ASIN keying                                                                                 | Active, purpose-built as the more robust fork                                                                                                                                                                                                       |
| **Open Library**                    | **Catalogue only** — search/subject/author browsing. No verified "similar books" or personalised endpoint in its own API surface (third-party wrapper services claiming "find similar books" are not Open Library itself)                                                                                                                                                                              | No                                                                  | Free, no key                                               | Plain HTTP/JSON, TS-native   | **ISBN**, `/works/OL...W` ids — ISBN already flows through `abs-client`'s `Book.isbn` today      | Actively run (Internet Archive)                                                                                                                                                                                                                     |
| **Google Books API**                | **Catalogue only** — search and volume lookup; no similar-books endpoint of its own (confirmed by search: "the Google Books API itself does not appear to have a built-in similar books endpoint")                                                                                                                                                                                                     | No                                                                  | Free tier with API key; higher quota with billing          | Plain HTTP/JSON, TS-native   | ISBN, Google volume ids                                                                          | Actively run (Google)                                                                                                                                                                                                                               |
| **Hardcover** (`api.hardcover.app`) | **Catalogue with real social signal** — ratings distributions, tags, per-user read counts from an active community; positions itself explicitly as a Goodreads-API alternative. Whether it exposes a true personalised "recommended for you" feed via its public GraphQL schema is **not confirmed** — its docs describe rich query access to books/reviews/tags, not a stated recommendation endpoint | Unconfirmed — worth a follow-up schema read before ruling in or out | Free-to-use GraphQL endpoint, per its own docs             | GraphQL over HTTP, TS-native | Hardcover's own book ids; ISBN present on book records                                           | Active, community-driven, current (2026 docs exist)                                                                                                                                                                                                 |
| **Goodreads**                       | N/A — **API closed to new developers since December 2020**, confirmed                                                                                                                                                                                                                                                                                                                                  | N/A                                                                 | N/A                                                        | N/A                          | N/A                                                                                              | Dead as an integration path; noted per the spec's request, not a candidate                                                                                                                                                                          |
| **StoryGraph**                      | No official API; only unofficial scrapers exist (Python package requiring browser-cookie auth; a Netlify-Functions scraper)                                                                                                                                                                                                                                                                            | N/A                                                                 | N/A — would mean scraping a personal, cookie-gated account | N/A                          | N/A                                                                                              | Not a viable integration; scraping a service that explicitly has no public API and no stated tolerance for it is a materially different risk from Audnexus's "against ToS, community-tolerated, zero enforcement" pattern — do not conflate the two |
| **Libro.fm**                        | No public API at all, confirmed (Libro.fm's own team, quoted in a 2023 GitHub thread, calls API access "aspirational")                                                                                                                                                                                                                                                                                 | N/A                                                                 | N/A                                                        | N/A                          | N/A                                                                                              | Not viable today                                                                                                                                                                                                                                    |

### Recommendation: **Audnexus (or AudiMeta as the more robust fork) for catalogue enrichment, but neither is a recommender — pair with a taste-driven query strategy Auralis builds itself**

None of the surveyed book sources is a real recommendation service the way ListenBrainz is for
music — every one of them is search/lookup by identifier or free text. `docs/INTEGRATIONS.md`
already reached this conclusion for Audnexus specifically and it holds: Audnexus/AudiMeta are
the right **enrichment** layer (author, series, narrator, genre by ASIN — the identity
Audiobookshelf itself already trusts, and the user has explicitly waived the Audible-ToS
concern for her own install), but "recommend a book she doesn't own" has to come from **Auralis's
own scoring core** issuing free-text/subject/author queries against Audnexus (or Open Library as
a redundant fallback, since it needs no key at all) using the `authors`/`series`/`genre`
affinities `buildTasteProfile()` already computes — e.g. "more by an author she rates highly,"
"next in a series she is partway through," "same genre tag, different author." This is
structurally the same pattern phase 13's `shelves.ts` already uses over library items; decision
1 asks for the identical mechanism pointed at an external catalogue instead.

**Hardcover is worth a fifteen-minute follow-up before committing**, specifically to read its
GraphQL schema for a stated recommendation field (its community-ratings signal, if genuinely
exposed as "books similar readers also loved," would be closer to a true recommender than
anything else surveyed here) — this document could not confirm that from its own documentation
pages within scope, and it is the one candidate whose answer might change the recommendation.

---

## 4. Podcasts

`docs/INTEGRATIONS.md`'s existing PodcastIndex research is read, not re-derived (per the task's
own instruction) — this section adds Listen Notes and iTunes and states the recommender-vs-
catalogue question the existing note did not need to answer for its own purpose.

### Candidates surveyed

| Provider                             | Recommender or catalogue?                                                                                                                                                                                        | Personalises?                                                                                                                                                                                    | Auth/cost                                                                                                                                                                                                                  | Runtime fit                | Identity mapping                                                                                                                                           | Liveness                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **PodcastIndex.org**                 | **Catalogue only**, confirmed by its own API surface (search/lookup by feed id/URL/iTunes id/GUID/tags/trending) — no similar-podcast or personalised endpoint                                                   | No                                                                                                                                                                                               | Free key + secret, signed-request auth (4 headers, HMAC-style)                                                                                                                                                             | Plain HTTP/JSON, TS-native | **Feed URL and podcast GUID** — the identifiers Audiobookshelf's own podcast metadata carries but Auralis's normalized `Podcast` type currently drops (§1) | Active, mission-driven, non-commercial                                                       |
| **iTunes/Apple Podcasts Search API** | **Catalogue only**, confirmed — search and id lookup, no similar/recommendation surface                                                                                                                          | No                                                                                                                                                                                               | No key at all                                                                                                                                                                                                              | Plain HTTP/JSON, TS-native | iTunes numeric ids, feed URL in results                                                                                                                    | Active (Apple), already Auralis's existing podcast search backend per `docs/INTEGRATIONS.md` |
| **Listen Notes**                     | Advertises "recommendations" and "best-of" surfaces on top of its catalogue — closer to editorial/chart-based than a personalised-to-a-user feed; genuinely closest thing to a podcast recommender surveyed here | Not to an individual user's taste — no mechanism found to feed it a taste profile; its recommendation surface reads as content-based ("shows like this show"), not collaborative or personalised | **Free tier: 300 requests/month.** Paid: ~$180/month for 5,000 requests. **Flag for her: usable free tier exists, but is small — 300/month is roughly 10/day, tight for a live recommendation feed unless heavily cached** | Plain HTTP/JSON, TS-native | Listen Notes' own ids; feed URL/iTunes id present in results                                                                                               | Active, commercial product                                                                   |

### Recommendation: **No true podcast recommender exists among free/open catalogues — build "more from this show's genre/network" over PodcastIndex + iTunes, same pattern as books**

This is the honest finding, not a gap in the research: none of the three surveyed podcast
sources personalises to a taste profile. PodcastIndex is the best-identified catalogue (feed
URL/GUID map cleanly to what Audiobookshelf already stores, once §1's normalization gap is
closed) and needs no ongoing cost; pair it with the genre/author(host) affinities already
computed and generate "more from `<genre>`" or "more podcasts like `<show>`'s tags" shelves the
same way books do. **Listen Notes' content-based "similar shows" is worth keeping in reserve** —
it is the one candidate that does something closer to real recommendation — but its 300
req/month free tier is a real constraint worth stating rather than discovering later, and
nothing about it is personalised enough to justify the cost over the free PodcastIndex-driven
approach as a first cut.

---

## 5. The recommended shape

### First provider to implement: **ListenBrainz (music, tier 1)**

It is the strongest candidate across all nine surveyed, on every axis that matters here: it is
a genuine recommender (not a catalogue join), it needs zero credential from the user for its
public tier, it is plain TypeScript-reachable HTTP, and it is keyed on MBIDs — an identifier
this project should be surfacing anyway (§1). Building it first also forces the identity-mapping
work 15b needs (resolving Jellyfin artist names to MBIDs) in the medium where the mapping is
cleanest, before books and podcasts — whose enrichment/catalogue sources are all real but none
of which is itself a recommender — need their own, separately-shaped "generate candidate
queries from the taste profile" logic.

### What the interface must expose to serve all three media without leaking provider specifics

Per phase 9's precedent ("the provider interface is pluggable, so a new provider is a new file,
not a refactor") and 15a's own framing ("what an external candidate is: a catalogue entry that
is not a library item"), the seam should be a per-medium interface something like:

```ts
interface ExternalRecommendationProvider {
  readonly medium: 'music' | 'book' | 'podcast';
  /** Given the relevant slice of TasteProfile, return candidates not already known-owned. */
  recommend(profile: TasteProfileSlice): Promise<ExternalCandidate[]>;
}

interface ExternalCandidate {
  providerId: string;          // opaque to the caller — MBID, ASIN, feed GUID, etc.
  providerName: 'listenbrainz' | 'audnexus' | 'podcastindex' | /* … */;
  title: string;
  creator: string | null;      // artist / author / host
  genres: string[];
  reason: string;               // "similar to <seed>" — provider-specific phrasing stays inside
}
```

The important constraint, given music is genuinely a recommender and books/podcasts are
catalogue-plus-Auralis's-own-query-generation: **the "how do I get candidates" step differs per
medium (ListenBrainz asks the provider directly; books/podcasts ask Auralis's own scoring core
to formulate the query and the provider only resolves it), but the output shape — an
`ExternalCandidate[]`, mediumless from `shelves.ts`'s point of view — must be identical**, so
15c's mixing rule and 15b's identity/dedupe logic touch one shape regardless of which of the
three mechanisms produced it. Do not let "music is a recommender, books/podcasts are queried
catalogues" leak into the shelf-construction layer — that asymmetry belongs entirely inside each
per-medium provider implementation.

### What would change this recommendation

- **If Hardcover's GraphQL schema does expose a genuine "similar readers also loved" field**
  (§3's open follow-up), it would be strong enough to promote books above podcasts in build
  order, though probably not above music — ListenBrainz's zero-credential public tier is still
  the cheapest true recommender surveyed.
- **If she wants tap-to-preview streaming of a recommended track** (not just a recommendation,
  playback of something unowned) — this is the one place §0's NewPipeExtractor finding still
  matters, as a separate Android-only playback spike, not as decision 1's provider.
- **If she is willing to create a ListenBrainz account and connect a Jellyfin scrobbling
  plugin**, tier 2's genuinely-personalised CF recommendations become available and are strictly
  better than tier 1 — worth revisiting once tier 1 has shipped and proven the mechanism.

## What needs her, and what does not

Per the escalation rule stated for this task (_"would she have an opinion, and does the answer
change what she gets?"_), only two things here clear that bar, and neither blocks 15a:

1. **ListenBrainz tier 2** (genuinely personalised music recs) needs her to create a
   ListenBrainz account and connect Jellyfin scrobbling to it. Tier 1 needs nothing from her and
   is the one to build first — stated so this is not read as blocking the whole music path.
2. **Listen Notes' free tier is 300 requests/month** — usable, but tight for a live feature.
   Worth her knowing before it's built on, not a blocker since PodcastIndex (free, uncapped
   per its own docs) is the recommended podcast path regardless.

Provider choice itself is delegated, per `USER_DECISIONS.md` — this document decides it rather
than asking.

## What could not be verified

- Hardcover's GraphQL schema was not read field-by-field for a stated recommendation/similarity
  query — flagged in §3 as the one open follow-up that could change the book recommendation.
- Whether a Jellyfin ListenBrainz-scrobbling plugin exists, and its reliability — not
  investigated; relevant only if tier 2 is ever pursued.
- Real-world recommendation quality for any surveyed provider against the user's actual
  231-item Audiobookshelf library or her real Jellyfin listening history — the project's
  standing blocker (`HANDOVER.md`: no session here has an Audiobookshelf or Jellyfin credential)
  applies identically to judging any of these, not just phase 13's library-internal ranking.
- Deezer's exact rate limits on unauthenticated catalogue endpoints were not pinned to a number
  from primary documentation — treated as "public and keyless" per corroborating sources, not
  verified against Deezer's own current developer docs page directly.
- MusicBrainz search-by-name accuracy for resolving Jellyfin's plain artist-name strings to
  MBIDs (needed to feed ListenBrainz tier 1) was not measured — it is the standard MusicBrainz
  search endpoint, well precedented, but fuzzy-name matching is exactly the class of problem
  `HANDOVER.md`'s minified-item lessons warn about, and 15b should treat it as adversarial input
  requiring the same "exact match / near-match / no match" case analysis already specified for
  library dedupe.

# Streaming vs acquisition for music — NewPipe, InnerTube, and decision 1

Investigated 2026-08-16, against commit `dd8eba8`. Owed since `docs/USER_DECISIONS.md`'s 9c:
_"I know deemix exists; your original recommendation was to go with soulseek tho. But have
you looked into how that other app did it? I forget what it was called but I believe it used
NewPipe to stream music."_ No implementation in this document — it is the research the
question asked for, before any more music-request or recommendation work.

## 0. Recommendation, up front

**Do not build a NewPipeExtractor-based provider for decision 1 (external recommendations).**
Keep that phase on the already-researched, TS-native catalog layer — MusicBrainz for music,
PodcastIndex for podcasts, Audnexus/AudiMeta for books (`docs/INTEGRATIONS.md` §"Discovery
layer") — now that her own message lifts the Audible-ToS blocker that was the one thing
holding Audnexus back. That layer covers all three media types decision 1 needs; a
NewPipeExtractor source covers at most one.

**A NewPipeExtractor-based _streaming_ path is a real, separate idea — a fourth playback
backend that lets a user hear a track that isn't in the library at all, before requesting or
owning it — and it is worth a future spike, but not this one and not as part of decision 1.**
It is JVM-only with no trustworthy TypeScript port (§2.3), so it can only live on Android
without breaking this project's structural web/Android parity, and "stream something we don't
own" is a different product surface than "recommend something we don't own," even though both
start from the same not-in-library set.

What would change this: if the user says she specifically wants tap-to-preview streaming of a
recommended track before requesting it — not just a recommendation, but instant playback — that
promotes an Android-only NewPipeExtractor spike above the catalog-layer phase. Nothing found
here settles that; it is a taste question about the product, and by this project's own test
("would she have an opinion, and does the answer change what she gets?") it is a real one to
ask rather than one to guess at.

---

## 1. What app she is thinking of

She could not remember the name. Naming it correctly is part of the deliverable, so this
section gives the strongest match and the honest runners-up rather than picking one.

### Best match: **ViMusic** (`vfsfitvnm/ViMusic`)

ViMusic is the app that most literally fits "used NewPipe to stream music": in its original
form it used **NewPipeExtractor itself** — the library, not a look-alike — to resolve YouTube
Music stream URLs and metadata, with no official API key. It streams from YouTube Music,
supports background playback, offline caching, and playlist import — the shape she described.

**It is a moving target, and the part she remembers is now historical.** The original
repository (`vfsfitvnm/ViMusic`) was **archived by its owner on 2025-07-30** — read-only,
development stopped ([GitHub search result, confirmed via `alternativeto.net` and GitHub
listings, fetched 2026-08-16]). Before archiving, the project itself opened an issue
([`vfsfitvnm/ViMusic#334`](https://github.com/vfsfitvnm/ViMusic/issues/334), fetched
2026-08-16) proposing to **move off NewPipeExtractor onto a YouTube-Music-specific "Innertube"
library** — see §2.1 for why. Several forks continue under the ViMusic name (e.g.
`Jigen-Ohtsusuki/ViMusic`, explicitly still built on the NewPipeExtractor engine); none is the
original, actively-stewarded project any more.

### Plausible alternates, and why they're a weaker fit

- **InnerTune** (`z-huang/InnerTune`, and its forks OuterTune, Metrolist, ArchiveTune) — a
  Material 3 YouTube Music client matching her aesthetic taste (she cited Material/Claude
  design language elsewhere). But it and its lineage use an **InnerTube-based** library, not
  NewPipeExtractor (§2.1) — a different, YouTube-Music-specific unofficial API, not the same
  tool. If she meant one of these, "NewPipe" would be a misremembered label for a similar-in-
  spirit but technically distinct approach. **OuterTune is no longer in active development**;
  its own README now points users at Metrolist instead (fetched 2026-08-16).
- **Metrolist** (`MetrolistGroup/Metrolist`) — same InnerTube-based lineage, currently the most
  actively maintained app in this family. Same caveat as InnerTune: not NewPipeExtractor.
- **NewPipe itself** (`TeamNewPipe/NewPipe`) — the original YouTube/SoundCloud/PeerTube/
  Bandcamp client. It is not a music-specific app, but background audio playback of a YouTube
  video _is_ a way to "stream music" with NewPipe, and this is the one unambiguous case where
  the app really is called NewPipe. Possible she meant literally this.
- **Tubular** — a NewPipe fork adding SponsorBlock/ReturnYouTubeDislike, same multi-platform
  scope (YouTube, YouTube Music, SoundCloud, Bandcamp, PeerTube) and the same NewPipeExtractor
  engine as its parent. Same caveat as NewPipe itself: general client, not music-specific.

**Confidence: moderate-high on ViMusic as the technically correct answer** (it is the one app
in this list that genuinely used NewPipeExtractor, by name, for music), **moderate on whether
it's what she actually saw** (InnerTune/Metrolist's design and feature set — Material 3,
YouTube Music streaming, offline cache, lyrics — is at least as plausible a memory, and she may
be conflating the two families, which is easy to do since ViMusic's own README historically
described itself in the same terms). This is not resolvable further without asking her, and per
the project's own escalation test this genuinely is a case where the answer might change what
she gets — the recommendation in §0 does not depend on which one she meant, but do not
overstate certainty either way.

---

## 2. What NewPipeExtractor actually is and does

Source: [`TeamNewPipe/NewPipeExtractor`](https://github.com/TeamNewPipe/NewPipeExtractor)
(fetched 2026-08-16), its
[javadoc index](https://teamnewpipe.github.io/NewPipeExtractor/javadoc/index-all.html) (fetched
2026-08-16), and the NewPipe project blog (fetched 2026-08-16).

**What it is.** A Java library — GPL-3.0, distributed via JitPack/Maven, no Google API key
required — that scrapes streaming-site HTML/internal endpoints and exposes a typed extraction
API: stream resolution (audio/video URLs, quality options), search (with query-suggestion
support), playlists, channels, comments, and per-platform "kiosk" (trending/featured/radio)
listings. It is the engine inside the NewPipe app, but is usable standalone.

**Services supported today: YouTube, SoundCloud, media.ccc.de, PeerTube, Bandcamp.** Of those,
only YouTube (as general video, not YouTube Music specifically) and SoundCloud carry meaningful
music weight; Bandcamp is niche but real (independent/DIY music, and its extractor has explicit
recommendation support, below); PeerTube and media.ccc.de are not music platforms.

### 2.1 Search, metadata, and related items — the pivotal question

**It exposes all three, but the "related items" signal is coarser than a recommendation
feed, and it is not YouTube-Music-aware.**

- **Search**: yes, per-service (`SearchQueryHandlerFactory`), plus search-suggestion support
  (e.g. `BandcampSuggestionExtractor`).
- **Related/recommended items**: yes for YouTube — `StreamExtractor.getRelatedItems()` returns
  the same "up next" / related-videos list YouTube itself shows on a given video's page, pulled
  from that response's `secondaryResults`. **This is per-item, not personalized**: it is
  YouTube's own algorithm's answer to "what's related to this one video," not a taste profile
  Auralis controls or could rank against its own scoring core. Bandcamp has an explicit,
  differently-shaped signal — `BandcampRelatedPlaylistInfoItemExtractor`, documented as
  extracting "recommended albums from [a] track's website" — closer to album-level "similar
  artists," but scoped to whatever an artist's Bandcamp page links.
- **This is the crux for decision 1.** NewPipeExtractor targets general YouTube video, not
  YouTube Music's browse/home/recommendation surface. That's exactly what pushed ViMusic away
  from it (§1): per its own migration issue, NewPipeExtractor is "more for YouTube videos
  rather than YouTube Music," while the InnerTube-based approach its successors adopted
  specifically buys "browse everything as in YouTube Music," a proper home page with
  suggestions and new releases, and faster stream loading. **The ecosystem's own verdict is
  that NewPipeExtractor is the wrong tool for YouTube-Music-shaped recommendation work** —
  which is a stronger signal than anything this document could derive independently.

### 2.2 Runtime, and where it could live

**Java/JVM only.** Consumed as a Gradle/Maven dependency. That makes it trivial to add to
`apps/android` (Kotlin talks to JVM libraries natively) and genuinely awkward for
`apps/server`, the Node/TypeScript Fastify BFF.

**There is no trustworthy TypeScript port.** A package named `newpipe-extractor-js` exists on
npm (10 published versions, last 2026-05-31, `v1.0.33`), and its own `package.json` claims
authorship as `NewPipe Extractor JS Contributors` with a repository URL of
`https://github.com/TeamNewPipe/NewPipeExtractor-js`. **That repository does not exist —
fetching it returns a 404**, verified directly 2026-08-16. The package has a single listed
maintainer (`meisterblack1211`, not a name that appears in TeamNewPipe's own org) and **zero
dependents**. This does not prove bad faith, but it does mean the claimed official affiliation
is unverifiable and, on the one check available, false. **Treat it as an unofficial,
unverified, single-maintainer reimplementation — not the equivalent of the real Java library —
and do not adopt it on the strength of its name or its claimed homepage.**

**So the real options for using NewPipeExtractor from `apps/server` are:**

1. **Run the real Java library as a sidecar process** the Fastify BFF calls over HTTP/gRPC.
   This directly cuts against the standing "One container, one port" decision
   (`CLAUDE.md`/`HANDOVER.md`: "The BFF serves the built web assets on its own origin — no
   separate nginx, no CORS for the user to get wrong") — it would add a second runtime and a
   second process to a deployment that was deliberately kept to one.
2. **Reimplement the scraping natively in TypeScript.** A real, ongoing maintenance burden —
   see §2.3 on how often the Java original needs patching just to keep up with YouTube.
3. **Put it only on Android.** This is the option that costs the least engineering and the
   most architecturally: it breaks the reason the BFF pattern exists at all. `CLAUDE.md`'s own
   words: "web and Android consume one identical typed API, so parity is structural rather than
   aspirational." A music source that only Android can see is exactly the asymmetry that
   decision structurally rules out.

None of the three is free, and none is a small addition next to the existing BFF-mediated
architecture.

### 2.3 Brittleness

**Real and ongoing, not a one-time cost.** NewPipe's own blog (fetched 2026-08-16,
["NewPipe 0.27.6 released, state of the rewrite, state of the team"](https://newpipe.net/blog/pinned/announcement/newpipe-0.27.6-rewrite-team-states/))
describes the team as capacity-constrained — "all active team members are really busy with
their lives and can only find very little time" — while still actively patching: recent
releases fixed YouTube-imposed "integrity checks," and the project has been working through
YouTube's SABR (server-side adaptive bitrate) enforcement, which broke stream extraction and
required coordinated fixes across 2025 (GitHub issue history, fetched 2026-08-16). This is the
normal life of an unofficial scraper: it is maintained, but every YouTube-side change is a
potential outage until someone patches it, and the team explicitly says it needs more
contributors to keep pace. Budget for that as an ongoing tax, not a solved problem, if this is
ever adopted.

**A related, separate risk worth naming but not conflating with the above**: Google's Android
Developer Verification programme — requiring every installed app, including sideloaded ones,
to be tied to an identity-verified developer — begins rolling out worldwide in August 2026 with
enforcement starting 2026-09-30 in an initial set of countries and expanding globally in 2027
([Android Authority](https://www.androidauthority.com/android-open-source-apps-sideloading-oppose-3674808/),
[Hackaday](https://hackaday.com/2025/08/26/google-will-require-developer-verification-even-for-sideloading/),
fetched 2026-08-16). NewPipe's maintainers have stated they will not comply. **This is a
distribution problem for apps, not an extraction problem for the library** — it does not break
NewPipeExtractor's code — but it is the same regulatory pressure Auralis's own self-hosted
F-Droid route (phase 11, out of scope for this document, owned by another session) is exposed
to, and it is a data point that the ecosystem NewPipe lives in is getting more hostile, not
less.

---

## 3. Streaming vs acquisition — the actual comparison

|                                     | **Streaming** (e.g. NewPipeExtractor → YouTube/SoundCloud)                                                                                                                                                                                                           | **Acquisition** (existing slskd pipeline → Jellyfin)                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Offline playback**                | Only if a separate download/cache layer is built on top — the brief explicitly wants offline downloads and background playback on Android, and this doesn't come free with a stream URL                                                                              | Native: the file lands on disk, Android's existing download machinery applies unchanged                                                      |
| **Storage**                         | None consumed                                                                                                                                                                                                                                                        | Consumes disk per acquired title; the tradeoff acquisition always accepts                                                                    |
| **Library coherence**               | **A streamed track does not exist in Jellyfin at all.** It has no artwork pipeline, no play-history entry, no place in the recommendation core's Jellyfin-play-history signal (13a–13f). Half the library-affinity mechanism phase 13 built would simply not see it. | A first-class Jellyfin item: artwork, metadata, play history, and everything phase 13's scoring core already reads                           |
| **Latency/reliability, first play** | Depends entirely on the upstream site staying scrapable that day (§2.3); when it breaks, it breaks for every user simultaneously, with no local fallback                                                                                                             | Depends on Soulseek/slskd finding a source; slower to first play (a request-and-wait pipeline), but once acquired it's reliable indefinitely |
| **Metadata quality**                | Whatever YouTube/SoundCloud/Bandcamp expose per-item — titles, channel names, thumbnails; no clean mapping to Auralis's normalized `authors[]`/`series[]`/genre domain types, and no album-artist structure to speak of on YouTube                                   | Whatever the acquired file's own tags carry, refined by Jellyfin's own metadata providers — closer to Auralis's existing normalized shapes   |
| **Failure mode the user sees**      | A scraper-broken day means playback of that source silently stops working, project-wide, until upstream is patched (§2.3)                                                                                                                                            | A download that never seeds sits in `importRequested` indefinitely — visible, not silent, and scoped to that one title                       |
| **ToS exposure**                    | She has explicitly lifted this for her own install ("I do not care about audible's or youtube's TOS") — noted as her decision, not a licence to redistribute publicly                                                                                                | Already the accepted model (Soulseek/slskd), no change                                                                                       |

**Are they mutually exclusive?** No, and the honest answer is they solve different problems
rather than compete for the same one. Streaming is a _preview/discovery_ primitive — hear
something now, decide if it's worth keeping. Acquisition is a _library_ primitive — own it,
have Jellyfin track it, have Android download it for good. **A hybrid (stream to preview, then
request to acquire what she keeps) is coherent as a product idea** — it maps cleanly onto "For
you" showing an external recommendation she can either tap-to-preview or tap-to-request — but
it is genuinely two build efforts stacked, not one: the streaming half needs its own playback
backend, separate from the Jellyfin-proxied HLS/direct-play path Auralis already has, with none
of the offline/download/library-coherence benefits acquisition already gets for free. **Building
both at once is not the efficient path; building acquisition-first (already largely built) and
treating streaming as a later, additive spike is.**

---

## 4. Bearing on decision 1 (external recommendations)

Decision 1 (`docs/USER_DECISIONS.md` §1) needs a source that returns titles **not in the
library**, mixed into For You, and it explicitly spans **books, podcasts and music** — the same
requirement phase 13's ranking core was built for, just widened past what's already owned.

**A NewPipeExtractor-based source is a plausible future _playback route_ for one of those three
media types. It is not a good foundation for the recommendation source itself, for three
independent reasons, any one of which would be disqualifying alone:**

1. Its own ecosystem's verdict, cited firsthand in §2.1, is that it is the wrong tool for
   YouTube-Music-shaped discovery — the very apps built to serve that need migrated off it.
2. It only ever addresses music. `docs/INTEGRATIONS.md`'s already-researched
   MusicBrainz/PodcastIndex/Audnexus layer addresses all three media types decision 1 needs,
   is TypeScript-native (no JVM sidecar, no parity break — `musicbrainz-api` is a real npm
   package with built-in rate-limit throttling, already vetted in that document), and her
   message directly unblocks Audnexus by lifting the one ToS objection that was holding it
   back.
3. Where it does have a real recommendation-shaped signal (`getRelatedItems()`), it is
   per-item related-videos, not a personalized feed — Auralis would still have to build the
   entire personalization layer (feeding a user's play history through repeated calls, merging,
   ranking) itself. The catalog layer's MusicBrainz path integrates with genre/artist-affinity
   data the recommendation core (13a–13f) already computes; NewPipeExtractor's related-items
   would be a second, parallel signal source bolted onto the side rather than feeding the same
   pipeline.

**What it does solve, and what it explicitly does not solve.** If pursued later as a playback
feature, streaming addresses "let me hear this recommended track right now" for **music only**.
It says nothing about books or podcasts — there's no equivalent NewPipeExtractor-adjacent
streaming source for audiobook or podcast content in scope here (Audible/audiobook content on
YouTube exists but is a different, murkier scraping target entirely, not evaluated in this
document), so any solution built solely on it would leave two of decision 1's three media types
untouched.

---

## 5. What could not be verified

- **Which app she actually means.** §1 gives the strongest candidate (ViMusic) and named
  runners-up, but this is fundamentally a memory question only she can resolve, and the
  document does not manufacture false certainty about it.
- **`newpipe-extractor-js`'s real provenance and completeness.** Established that its claimed
  GitHub repository doesn't exist and its npm listing shows a single maintainer with zero
  dependents; not established who actually maintains it, why it names itself under the
  TeamNewPipe org, or how much of the real library's surface it actually reimplements. Treated
  as untrustworthy on that basis, not audited line-by-line.
- **Whether YouTube's audiobook-adjacent content is scrapable/usable at all via
  NewPipeExtractor** — out of scope for this document (it targets the music question), and not
  researched here.
- **Recommendation quality of any of this against Auralis's real 231-item library.** Same
  standing blocker as everywhere else in this project: no session here has an Audiobookshelf or
  Jellyfin credential (`docs/HANDOVER.md`), so nothing about how _good_ any of these sources
  would feel in practice — including the already-recommended MusicBrainz path — can be judged
  from this machine.

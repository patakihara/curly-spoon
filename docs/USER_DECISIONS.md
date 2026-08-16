# User decisions — answered 2026-08-16

Sofia answered the whole "Open product decisions" list in one message. This file is the
record. **It is the authority over anything in `ROADMAP.md` or `HANDOVER.md` that predates
it** — where they disagree, this wins, and the stale text is the thing to fix.

Kept as its own file rather than folded into `HANDOVER.md` because `HANDOVER.md` is
`@`-imported into every session and must stay short; this is reference material to consult
when picking up the affected item. `HANDOVER.md` points here.

---

## The three that change what gets built

### 1. Recommendations must pull from **external** sources — the phase 13 design misread the ask

Her words: _"Recommendations are not pulling from external sources. It seems you
misunderstood. It is not useful to me if recommendations only show things already in my
library. There should be an actual and good recommendation algorithm, like what spotify
uses, and this is what should be mixed into the results of the 'For you' page. (the library
pages should only show submitted requests and content on the library, however). It's up to
you which providers to choose. I do not care about audible's or youtube's TOS."_

**What phase 13 actually built:** a ranking core over items **already in the library**,
scored from Audiobookshelf progress and Jellyfin play history. Every shelf it produces is a
re-sort of what the user already owns. That is the mechanism working exactly as specified —
and the spec was wrong. `HANDOVER.md`'s own line "Judging whether the ranking is any _good_
wants the real 231-item library" shows how deep the misread went: the question was never
"how well do we rank 231 items", it was "what should she listen to next, including things
she does not have yet".

**What is now required:**

- A recommendation source that returns titles **not in the library**, mixed into For You
  alongside the existing library-derived shelves. Discovery, not re-shelving.
- **Library pages stay as they are**: only submitted requests and content actually in the
  library. The mixing happens on For You only. She stated this parenthetically and it is a
  real constraint, not an aside — it keeps "what I have" and "what I could have" separate
  everywhere except the one surface meant for discovery.
- Provider choice is **delegated to us**. She explicitly does not care about Audible's or
  YouTube's ToS, which removes the blocker recorded in `INTEGRATIONS.md` against Audnexus
  (it builds on Audible-scraping). That constraint is lifted **by the user, on her own
  install** — it is not a licence to ship anything public-facing that redistributes.
- A recommended title on For You is inherently **requestable**, since by definition it is
  not in the library. That is the natural seam with the phase 6/9 request pipeline and with
  decision 2 below.

**This is a phase, not a wave.** It needs its own `ROADMAP.md` section: provider survey,
a decision on the catalogue/metadata layer (`INTEGRATIONS.md` has the researched-not-decided
MusicBrainz / PodcastIndex / Audnexus options), the mixing rule for For You, and cold start.

### 2. Spotify is the reference, and it should be looked at rather than guessed at

Her words, on Home's loading state: _"I disagree that nobody should've made this call. Ofc
Home should be in a loading state before it loads? Two comments here: a carousel should not
show more than one episode of a given podcast, and there should be carousels with mixed
content. Investigate what spotify looks like; that's the reference."_

Three separate instructions:

- **Home holds a loading state until its sources settle.** This resolves 14c. The layout
  shift measured there (0.067 desktop / 0.053 mobile against a 0.001/0.008 baseline) comes
  from four independent async sources landing after first paint, each appearing from a
  zero-size rect. The fix that was deferred as "a product call" is now decided: hold the
  loading state. **Note the meta-correction — this was not a user-only call and should not
  have been escalated.** An obvious, conventional answer is ours to make.
- **A carousel must not show more than one episode of a given podcast.** A per-podcast
  dedupe in shelf construction. Server-side, in `shelves.ts`, so both clients inherit it.
- **There should be carousels with mixed content** — books, podcasts and music in one
  shelf, not one shelf per medium. This is the user's original "spotify bundles together
  music, podcasts, and audiobooks" sentence applied to the shelf layer, and the current
  design deliberately does not do it.
- **Investigate what Spotify looks like.** Not "design something Spotify-like from memory".
  `docs/research/spec-addendum/` already holds four of her own Spotify screenshots
  (deliberately untracked — they are her screenshots and this repo is public). Start there.

### 3. Search: already-owned titles are not requestable, but still appear — and search needs suggestions

Her words: _"No, an item that's already there should not be requestable. But it should still
show up in global search. Also, global search needs search suggestions."_

- **Settles 12c-2** (queue `440b217`), and settles it the same way for Search and for
  artist/author pages — which was the stated failure mode, deciding it twice differently.
  An owned title renders as a normal result that plays; it does not offer a request action.
- **New requirement: search suggestions in global search.** Not previously scoped anywhere.
  Spotify's search is one of her four named references, and the user's original brief calls
  out Spotify's search specifically. Needs its own wave.

---

## The rest, in her order

| #   | Item                                  | Her answer                                                                                                                                                                                                        | What it means here                                                                                                                                                                                                                                                                |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3   | 12a's cold-cache nav rail             | _"I have no idea what that means."_                                                                                                                                                                               | **Ours to decide, and the escalation was the mistake.** It was deferred three times as a user decision and she cannot parse the question. Pick a sensible default (the rail's known destinations, unfilled, rather than an empty rail) and stop asking.                           |
| 4   | Launcher icon                         | _"Yeah let's leave it hanging for now."_                                                                                                                                                                          | Stays open deliberately. The app ships Android's default and that is accepted for now. Does **not** block phase 11 — a repo listing with a default icon is fine.                                                                                                                  |
| 5   | Direct play vs transcode              | _"Transcode is fine for now."_                                                                                                                                                                                    | **Closed.** Do not touch `supportedMimeTypes`. The transcode path works; leave it.                                                                                                                                                                                                |
| 6   | `GET /requests` unscoped by caller    | _"For now I'm the only user, so this can be parked until later."_                                                                                                                                                 | **Parked, not closed.** Revisit if family accounts are ever actually created — the privacy gap is real, it just has no victim today.                                                                                                                                              |
| 7   | Lyrics search                         | _"A privacy opt-in? Yes get an external provider"_                                                                                                                                                                | **Approved.** Build the lyric index and backfill from an external provider. Her reply reads as mild surprise that this needed asking, so treat the opt-in as a courtesy setting rather than a gate.                                                                               |
| 8   | `LinearProgress`'s `wavy` mode        | _"Let's forget the wavy mode."_                                                                                                                                                                                   | **Closed.** Mantine has no wave primitive. Remove `wavy` from the API rather than leaving a prop that silently only thickens the bar — a prop that lies is the thing this project keeps paying for.                                                                               |
| 9a  | Should Android have a Settings screen | _"Yeah, it should."_                                                                                                                                                                                              | **Approved**, unscoped. Needs a wave; content undecided.                                                                                                                                                                                                                          |
| 9b  | Ebooks                                | _"Ebooks would be nice, also with syncing between text and sound, but this is a lower prio."_                                                                                                                     | **In scope, low priority.** Note the second half: **read-along sync between ebook text and audiobook narration**, which is a substantially bigger feature than "render EPUB" and needs its own research (Audiobookshelf's own ebook support, and whether any sync signal exists). |
| 9c  | Music request provider                | _"I know deemix exists; your original recommendation was to go with soulseek tho. But have you looked into how that other app did it? I forget what it was called but I believe it used NewPipe to stream music"_ | **An open question back to us — see below.**                                                                                                                                                                                                                                      |

---

## Her open questions, and what is owed back

### "What credential is blocking you?"

**Answered, and it is not one credential.** Two, both read-only, both hers to issue:

1. **An Audiobookshelf API token** for `192.168.100.34:13378`. This is the important one.
   `packages/abs-client` was written from fixtures and documented shapes; on 2026-08-06
   playback turned out to have been completely broken since the client was written, because
   a schema said `.optional()` where the real server sends literal `null`. The fixtures
   encoded the direct-play shape, which no real Auralis session has ever received. Everything
   in that client beyond `/status` and `/ping` is still unverified against reality.
2. **A Jellyfin API key** for `192.168.100.34:8096`, same problem one layer over: the lyrics
   schemas are source-derived and have never seen a real `LyricDto`, and 12b's "sorted by
   relevance" fix cannot be tested without a real server.

What either unblocks: recording real responses, diffing them against
`apps/server/src/testSupport/fakes/fixtures/*.json`, and fixing fixtures **and** schemas —
plus, for the first time, judging whether recommendations are any good against the real
231-item library instead of ten synthetic books.

**She has not yet been asked for these in a way she could act on.** `docs/setup/MY_SETUP.md`
names it as the first ask, and no session has followed through. That is on us.

### "Is there any verification you can do on android?"

**Yes, and more than a week ago — but strictly bounded, and the boundary matters.**

- **What exists now (wave 14b-1, today):** a Compose test harness — Robolectric plus
  `ui-test-junit4` — running under `./gradlew test` in CI. Compose **semantics** are now
  assertable: that a node exists, that it carries the contentDescription intended, that
  children are grouped into one accessibility node. 14b-2 used it immediately.
- **What it does not do:** it renders on the JVM against a shadowed framework. It will not
  tell you what TalkBack announces, how a row actually looks, or what is reachable by touch.
  It closes the gap between "a reviewer read it" and "a machine checked it". It does not
  close the gap to a device.
- **What is still device-only:** all visual conformance (12d), the Material You / motion /
  typography gaps in the UI audit, Android Auto, and the reported post-login crash.
- **A trap found today that undercuts every green Android badge:** Gradle serves
  `:app:testDebugUnitTest` **`FROM-CACHE`** on any sha that does not touch `apps/android`.
  A green Android run on a docs or web commit executed **no Android tests at all**, and
  rerunning a sha reuses the same cache. So an intermittent Android failure looks _fixed_
  exactly when push activity is highest. Only a change under `apps/android` draws a fresh
  sample. Check the log for a bare `> Task :app:testDebugUnitTest`, never the badge.
- **The honest summary for her:** cheap correctness and accessibility checks, yes, in CI.
  "Does it look right" and "does it not crash on a real phone", no — that still needs the
  device, or her reinstalling the current CI APK.

### "Have you looked into how that other app did it? I believe it used NewPipe to stream music"

**Not yet — this is genuinely owed.** The app is almost certainly one of the NewPipe-extractor
family. `NewPipeExtractor` is a Java library that scrapes YouTube/SoundCloud/Bandcamp and
exposes stream URLs without an API key; several music apps build on it. This bears directly
on decision 1 above — an extractor that can _stream_ is a different and much cheaper answer
than a request pipeline that _acquires a file_, and it may be the right provider for the
external-recommendation work rather than only for requests.

Her framing is a correction worth taking seriously: the phase 9 decision picked **slskd over
deemix** on the grounds that deemix is unmaintained — but that framed the whole question as
"which downloader", when streaming was an option nobody costed. **Deliverable: a research
note in `docs/research/` comparing NewPipe-extractor-based streaming against the slskd
request pipeline**, before any more music-request work.

---

## Two meta-corrections she made, which matter more than any single answer

1. **We escalate too much.** Of the nine questions, she reversed the framing on two: the Home
   loading state ("Ofc Home should be in a loading state") and the nav rail ("I have no idea
   what that means"). Both had been deferred multiple times as user-only calls. `CLAUDE.md`
   already says to make ordinary calls and escalate only what genuinely changes the product;
   these were ordinary calls dressed as product decisions. **The test is not "is this a
   product question" — nearly everything is. It is "would she have an opinion, and does the
   answer change what she gets?"**
2. **She will not be messaging again in this session.** _"I will not keep messaging you here.
   Document all of my answers so you don't lose them."_ Everything above is to be treated as
   standing instruction, and the work proceeds autonomously from here.

## Standing go-aheads granted in the same message

- **Phase 11 (F-Droid distribution) is priority 1**, to be done autonomously. Her belief:
  an earlier session already did the work and asked her to back up a key it generated; it
  then said it needed an extra GitHub permission, which she granted. She thinks it wrongly
  assumed it needed a _new_ token — _"It doesn't, it's the same token, I just gave it extra
  permissions."_ She suggests grepping her past transcripts for that exchange (there are few
  messages from her, so it is findable). **Do not ask her to re-do key generation before
  checking whether it already happened.**
- **The mediaserver auto-updating deployment go-ahead**: _"You have my go ahead for doing
  that on Jellyfin."_ Read as approval for the deployment item whose recorded caveat was
  "the other containers must stay running; above all, Jellyfin must not be taken down".
  Whoever picks it up still reads mediaserver's own `~/CLAUDE.md` first — this repo's scope
  rules do not extend there — and still does not take Jellyfin down.

---

## Sent a moment later, same session — priority order and what is coming

> _"the other day I recorded some ideas, a lot of which I've already said here, but that will
> be upcoming. And I've been working on a design system in claude design, which I may transfer
> to you today; it might imply a major overhaul of the frontend, but please note that the
> backend side is currently higher prio, especially the recommendation and request stuff."_
>
> _"spotify killer, don't forget ;)"_

**The priority order is now explicit, and it overrides the roadmap's own ordering:**

1. **Backend — recommendations and requests.** Decision 1 above (external recommendation
   sources mixed into For You) and the request pipeline are the top of the list.
2. **Phase 11 / F-Droid**, which she named priority 1 in the previous message. Both are
   priority 1; phase 11 is small, mostly-built and unblocks distribution, so it goes first
   by size rather than by rank.
3. **Frontend** — explicitly _not_ now.

**A design system is coming and may land today.** She is building it in Claude's design tool
and may transfer it here. She has already said it **might imply a major overhaul of the
frontend**. Two consequences worth acting on now:

- **Do not start speculative frontend restyling.** Anything cosmetic done before that lands
  is likely to be thrown away. This does not block decision 2's Home loading state or the
  carousel rules — those are behaviour and shelf composition, not visual design, and they
  survive a restyle.
- **When it arrives it is a phase, not a wave.** `DESIGN.md` is the current spec and a
  transferred design system supersedes rather than amends it. Expect to reconcile: the
  artwork-derived colour pipeline, the Material 3 Expressive spring/token layer, and the
  no-animation-library decision are all load-bearing and may or may not survive.

**More of her ideas are coming**, recorded separately, overlapping with what is above. Treat
this file as the current record, not the final one.

## The one-line statement of intent

**"spotify killer, don't forget ;)"**

Worth keeping at the bottom of this file as the test every decision gets held against. The
original brief said the goal is to replace Spotify — bundled music, podcasts and audiobooks,
with recommendations good enough that it _"cleverly serve[s] me audiobooks it thinks i will
enjoy."_ Decision 1 exists because the recommendation work, as built, does not clear that
bar: re-sorting a library is not what Spotify does. Mixed-content carousels, search
suggestions, and external discovery are all the same requirement seen from different angles.

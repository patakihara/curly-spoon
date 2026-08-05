# Web design audit — phase 10

Audited against `docs/DESIGN.md` at commit `c893dab`, against a live `pnpm dev` (BFF on
:8787, web on :5173) driven with fake Audiobookshelf + fake Jellyfin upstreams
(`AURALIS_FAKE_UPSTREAMS=1`), signed in as the fake user and with Jellyfin connected via
the same fixtures `e2e/app/music.spec.ts` uses. Six surfaces, two viewports each (desktop
1440×900, mobile 390×844), dark colour scheme. Screenshots referenced below are throwaway
files under `/home/sofiapata/.claude/jobs/adc620dd/tmp/*.png` — not part of this repo.

## 1. Verdict

The component-level styling — colour tokens, type scale, card shapes, the warm dark
neutral surface — is applied consistently and does read as the intended design language.
But structurally the app is still, on every one of the six surfaces tested, **the mobile
layout stretched to fill a wider viewport**, not the distinct large-screen layout
`DESIGN.md` specifies: no surface uses more than one narrow (~850px) content column at
1440px, leaving 30–40% of the viewport as dead space to the right of the persistent Now
Playing panel. This is exactly the failure mode phase 10 was scoped to catch. The single
biggest gap is that: **desktop never gets a real multi-column layout**, on Home, Search,
Music, or an album's track list. A second, independent gap — the persistent mini player
is invisible immediately after starting playback at the desktop breakpoint, then reappears
full-width and overlapping other chrome once the user interacts with it — suggests the
`>1240px` "expanded" breakpoint has had less real exercise than the compact one.

## 2. Findings, ranked by user-visible impact

### Finding 1 — Desktop is a stretched phone layout on every surface tested
**Surfaces:** Home, Search, Music home, Music album. **Viewport:** desktop (1440×900).
`DESIGN.md`'s Layout table promises, at `>1240px`, an "Expanded rail" plus "Persistent side
panel" — implying a large-screen layout distinct from the compact one, not merely a wider
copy of it. What's on screen: the nav rail did widen from icon-only to icon+label, and the
Now Playing side panel is genuinely present (see Finding 6, "what's right") — but the main
content column stays a single, narrow (~850px) list, identical in structure to the mobile
version, just with all the extra horizontal space left blank. `home-desktop.png` vs.
`home-mobile.png` shows the same single-row "Continue Listening"/"Recently Added" shelves,
same card size, same "3 cards then stop" behaviour, just wider margins. `search-results-
desktop.png` renders one `Dune` result card in a column that could easily hold four or
five. `music-album-desktop.png` renders a two-track list in the same narrow column. This
is the exact "stretched phone UI" the roadmap warned against, and it's the same defect on
every surface, not a one-off.

### Finding 2 — Persistent mini player is invisible on desktop until manually triggered, then renders full-width
**Surface:** Now Playing (mini + expanded). **Viewport:** desktop (1440×900).
`DESIGN.md`: "The mini player is always present when something is loaded, docked ... at the
foot of the rail." After clicking `item-play` on the book detail page and waiting 1.5s,
`now-playing-mini-desktop.png` shows the right-hand Now Playing panel populated correctly,
but **no docked bar at the foot of the nav rail** — despite the `mini-player` test id being
present in the DOM at that point (confirmed via `page.getByTestId('mini-player').count()`).
Clicking the mini player's own expand affordance then produces
`now-playing-expanded-desktop.png`, in which a mini-player bar *does* appear — but as a
full-width bar spanning from the left edge across the bottom of both the nav rail and the
main content column, not confined to the rail as "docked at the foot of the rail" implies.
`apps/web/src/components/Shell.tsx` renders `<MiniPlayer>` unconditionally for
`breakpoint !== 'compact'` as a sibling of the row containing the rail and content, so its
positioning is presumably CSS-driven; something in that CSS is not scoping the bar to the
rail's width, and isn't causing it to paint until some other state changes.

### Finding 3 — Text and controls overflow, uncontained, at the 390px mobile viewport
**Surfaces:** Book detail, Music home. **Viewport:** mobile (390×844).
Two independent occurrences: `book-detail-mobile.png` shows the title ("The Fellowship of
the Ring") and byline ("Narrated by Rob Inglis") running off the right edge of the screen
with no wrap — the cover image and text sit in a fixed-width side-by-side row that doesn't
reflow at this width. `music-home-mobile.png` shows the same class of bug in the top link
row: "Requests" is clipped to "Request" and the search button's label is clipped to
"Searc". This is a pattern (two surfaces, two different components), not an isolated typo.

### Finding 4 — The mobile expanded Now Playing sheet renders in a light, low-contrast palette
**Surface:** Now Playing, expanded. **Viewport:** mobile (390×844).
Every other surface in this audit, in both viewports, renders the same warm dark neutral
background with amber/cream text — consistent with `DESIGN.md`'s stated fallback source
colour (`#B8683C`, "no artwork, onboarding, error states"). `now-playing-expanded-
mobile.png` is the one exception: the sheet background is a pale cream/peach, and the
title/track-name text renders in a similarly pale tone on top of it, at visibly low
contrast — the opposite of `DESIGN.md`'s "every generated pair is checked for contrast ...
`on-*` roles clear WCAG AA" claim. Cover art never loaded in this run (broken-image icon
visible at the top of the sheet), so this looks like an artwork-colour-derivation fallback
picking a light scheme inside a session that is otherwise consistently dark — but that's an
inference from the screenshot, not something read from source in this pass (see §5, out of
scope: no code was read to confirm the mechanism).

### Finding 5 — Settings still shows Phase 5's placeholder copy for artwork colour
**Surface:** Settings. **Viewport:** both.
`settings-desktop.png` and `settings-mobile.png` both show, under the manual colour-swatch
picker: "Source colour (Phase 5 will set this automatically from artwork):" — literal
in-app copy referring to a still-future phase. `docs/ROADMAP.md` records phase 5 as done,
and `DESIGN.md`'s Colour section describes automatic artwork-derived colour as already
implemented. Either the copy was never updated once that landed, or the manual override
path was deliberately kept and the copy is simply stale about why it exists. Either way, a
user reads this screen as telling them the feature doesn't exist yet.

### Finding 6 — Cover art never rendered on any of the six surfaces
**Surfaces:** all six. **Viewport:** both.
Every item — book covers, author/artist images, album art — shows a broken-image icon
inside a bordered placeholder box, never a real image, across all 22 screenshots. This
means the audit could not observe two of `DESIGN.md`'s specific claims at all: that theme
colour is "derived from the current artwork" and that it "cross-fades between palettes on
track change." Both are unverified, not confirmed-working and not confirmed-broken. This
may be a fixture/fake-server image-URL issue specific to this environment rather than a
production defect — that determination needs someone to check the fake server's fixture
image URLs, which this pass did not do.

## 3. What's right — don't touch these

- **The persistent Now Playing side panel at the expanded breakpoint exists and is
  populated correctly.** `home-desktop.png`, `book-detail-desktop.png`, `search-*-
  desktop.png`, `music-*-desktop.png` and `settings-desktop.png` all show the right-hand
  panel either idle ("Nothing playing / Play a book to see chapters, speed, sleep timer and
  bookmarks here") or, once something is playing, populated with artwork slot, title,
  author, scrubber, transport controls, playback-rate control, chapter progress and a
  bookmark action — this matches `DESIGN.md`'s `>1240px` row exactly in kind, just not in
  the surrounding content width (Finding 1).
- **The warm dark neutral surface + amber accent is applied consistently** across every
  surface except the one mobile Now Playing anomaly (Finding 4) — this reads as the
  intended "Claude" warm-neutral reference and the stated `#B8683C` fallback, not a default
  Material blue or a mismatched per-page palette.
- **The compact (mobile) bottom nav bar is clean and consistent**: five icons with labels,
  a clear filled-pill active state, present and behaving identically across Home, Search,
  Music and Settings.
- **Search's status line ("1 book, 0 podcasts found for 'dune'.")** is a nice touch and
  reads consistently on both viewports — a concrete, specific empty/result summary rather
  than a generic spinner-then-silence.
- **Typographic hierarchy for page titles and section headers is consistent** across all
  six surfaces — "Home", "Search", "Music", "Settings" and section headers like "Continue
  Listening"/"Recently Added"/"Books" all render at the same weight and size wherever they
  appear, in both viewports.
- **The Music album track list is a reasonable structural match for the stated YouTube
  Music reference** — numbered rows, per-row add/favourite actions, track duration — even
  though its column is too narrow (Finding 1).

## 4. Ranked fix list

1. **[Defect]** Give desktop (`>1240px`) real multi-column layouts instead of a single
   narrow column: shelves on Home, search results, the Music artist/album grids, and album
   track lists should use the available width. Files: `apps/web/src/features/home/
   HomePage.tsx`, `apps/web/src/features/search/SearchPage.tsx`, `apps/web/src/features/
   music/MusicHomePage.tsx`, `apps/web/src/features/music/MusicAlbumPage.tsx`, and whatever
   shared content-width/grid CSS backs `.auralis-page` (likely under `apps/web/src/styles`
   or `packages/ui`). This is the single largest, most clearly-a-defect item — the roadmap
   itself names "not a stretched phone UI" as the phase 10 goal.
2. **[Defect]** Fix the desktop mini player: it should be visibly docked at the foot of the
   nav rail the moment something starts playing, not invisible until interaction, and it
   should never render full-width overlapping the content column. Files: `apps/web/src/
   components/Shell.tsx` (the `breakpoint !== 'compact'` `<MiniPlayer>` render) and `apps/
   web/src/features/player/MiniPlayer.tsx` plus its CSS.
3. **[Defect]** Fix uncontained text/button overflow at the 390px viewport on the book
   detail header and the Music page's top link row. Files: `apps/web/src/features/item/
   ItemPage.tsx`, `apps/web/src/features/music/MusicHomePage.tsx`.
4. **[Defect]** Investigate the pale, low-contrast palette on the mobile expanded Now
   Playing sheet — reproduce with `now-playing-expanded-mobile.png` as the reference,
   check what colour-derivation path runs when artwork fails to load. Files: wherever the
   `@material/material-color-utilities` integration and its no-artwork fallback live
   (`packages/ui/src/theme`), and `apps/web/src/features/player/NowPlaying.tsx`.
5. **[Defect, small]** Update or remove the "Phase 5 will set this automatically from
   artwork" copy in Settings. File: `apps/web/src/features/settings/SettingsPage.tsx`.
6. **[Design decision, not a defect]** Decide what a book/album/artist should look like
   when its artwork genuinely fails to load — a bare broken-image icon in a bordered box,
   seen on every surface in this audit, is unlikely to be the intended empty state for
   "beautiful" per the product brief, but picking the replacement (gradient, monogram,
   icon) is a call for the user, not an engineering fix.
7. **[Needs follow-up, not a defect]** Confirm whether search actually has a distinct
   in-flight/loading state — the fake backend in this environment responded too fast
   (under ~150ms) for this pass to observe one either way.

## 5. What this audit did not cover

- **Android** — explicitly out of scope for this pass.
- **The 600–1240px "Navigation rail / Split view, 2 columns" breakpoint** — only 1440px and
  390px were tested; the tablet-width behaviour `DESIGN.md` also specifies is unverified.
- **Real assistive tech** — no screen reader, no keyboard-only navigation walkthrough. The
  `mini-player`/`item-play` etc. test ids exist and are used for automation, but nothing
  here confirms the keyboard shortcuts or focus-ring behaviour `DESIGN.md`'s Accessibility
  section promises.
- **Motion** — spring easing, shape morphing on the Now Playing artwork, and the promised
  colour cross-fade on track change all need video or frame-by-frame capture to verify;
  static screenshots can't show any of it. Not attempted.
- **Hover states** — desktop hover affordances on cards, track rows and the mini player
  were not exercised; screenshots only capture rest and post-click states.
- **Real artwork rendering** — every image on every surface was a broken-image placeholder
  in this environment (Finding 6), so the artwork-derived-colour and cross-fade claims are
  neither confirmed nor refuted here.
- **Podcasts, Lyrics, Playlists, Favourites and Requests pages** — outside the six named
  surfaces; not visited in this pass.
- **Light colour scheme** — the browser context was forced to `dark` throughout, per the
  Playwright config's own convention; the light theme was not screenshotted on any surface.

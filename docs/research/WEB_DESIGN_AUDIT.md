# Web design audit — phase 10

Audited against `docs/DESIGN.md` at commit `c893dab`, against a live `pnpm dev` (BFF on
:8787, web on :5173) driven with fake Audiobookshelf + fake Jellyfin upstreams
(`AURALIS_FAKE_UPSTREAMS=1`), signed in as the fake user and with Jellyfin connected via
the same fixtures `e2e/app/music.spec.ts` uses. Six surfaces, two viewports each (desktop
1440×900, mobile 390×844), dark colour scheme. Screenshots referenced below are throwaway
files under `/home/sofiapata/.claude/jobs/adc620dd/tmp/*.png` — not part of this repo.

**Independently re-measured in a real browser** (1440×900 and 390×844) after first
publication; the headline claim below was overstated and has been corrected. The numbers
below reflect the re-measurement.

## 1. Verdict

The component-level styling — colour tokens, type scale, card shapes, the warm dark
neutral surface — is applied consistently and does read as the intended design language.
The large-screen layout is also largely real, not a stretched phone: the nav rail renders
as a genuine 220px icon+label rail at 1440px, the Now Playing side panel is a real 320px
panel flush to the viewport's right edge with no dead space beyond it, and the content
column between them (852px inside a 900px slot, about 5% total margin) is close to full
width. Search results and the Music artist/album grids already use a live CSS grid
(`repeat(auto-fill, minmax(200px, 1fr))`) that renders four columns at this width. The two
real defects are narrower: the persistent mini player sits off-screen below the fold on a
page tall enough to push past the viewport, because it's positioned as an ordinary flow
sibling rather than fixed or sticky — not, as first reported, invisible-then-full-width —
and Music's Jellyfin artist/album cards have no image-load fallback, so a failed cover
render leaves a bare broken-image glyph where Home's equivalent card already handles this
correctly.

## 2. Findings, ranked by user-visible impact

### Finding 1 — Mini player is not fixed to the viewport, so it sits below the fold on tall pages

**Surface:** Now Playing (mini). **Viewport:** desktop (1440×900).
`DESIGN.md`: "The mini player is always present when something is loaded, docked ... at the
foot of the rail." `MiniPlayer` renders with `position: relative`, as a sibling after
`.auralis-shell__row` — an ordinary block in page flow, not fixed or sticky to the
viewport. On the book detail page the content pushes total page height to 921px against a
900px viewport, so the mini player lands 21px below the fold: present in the DOM and
`isVisible()` (confirmed via `page.getByTestId('mini-player').count()`), but off-screen
without scrolling. Clicking the mini player's own expand affordance appears to make a
full-width bar appear — it does not: the mini player measures **360px wide at x:0,
unchanged before and after the click**. The browser auto-scrolls the off-screen element
into view ahead of the click, which is what makes it visible; no CSS state changes. The
missing `position: fixed`/`sticky` is the single cause behind both symptoms.

A secondary, real gap survives: the mini player is not docked at the foot of the rail as
`DESIGN.md` specifies. At 360px wide starting from x:0, it overlaps roughly 140px past the
rail's 220px boundary into the content column, rather than being confined to the rail's
width.

`apps/web/src/components/Shell.tsx` renders `<MiniPlayer>` unconditionally for
`breakpoint !== 'compact'` as a sibling of the row containing the rail and content — fixing
this is a CSS positioning change (`position: fixed`/`sticky` plus width scoped to the
rail), not a structural rewrite.

### Finding 2 — Desktop layout is close to `DESIGN.md`'s intent, not a stretched phone

**Surfaces:** Home, Search, Music home, Music album. **Viewport:** desktop (1440×900).
The nav rail is a real 220px icon+label rail at 1440px. The Now Playing side panel is a
real 320px panel occupying x:1120→1440 — flush to the viewport's right edge, with no dead
space beyond it. The content column between them is 852px inside a 900px available slot,
about 5% total margin. Search results and the Music artist/album grids use
`.auralis-card-grid` (`repeat(auto-fill, minmax(200px, 1fr))`), which renders
`grid-template-columns: 201px 201px 201px 201px` — four live columns; a search returning a
single `Dune` result reflects the query matching one item, not a layout that can't hold
more.

Home's shelves are horizontal-scroll rows (`overflow-x: auto`, `flex: 0 0 auto` cards) and
the album track list is a vertical list (`flexDirection: 'column'`) — both deliberate
structural choices matching the stated YouTube Music reference, not a mobile layout
stretched wide. Nothing here rises to a defect; this surface is closer to `DESIGN.md`'s
intent than the audit first concluded.

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

### Finding 6 — Cover art never rendered; one environment artefact, one real defect, one open design decision

**Surfaces:** all six. **Viewport:** both.
Every item — book covers, author/artist images, album art — shows a broken image where a
cover should be, across all 22 screenshots. Network responses split this into three
separate things: one environment artefact, one real code defect, and one open design
decision.

**Environment artefact, not a defect.** The image requests returned **HTTP 200 with
`image/jpeg` headers**, never a 404. The fake Audiobookshelf and Jellyfin servers'
`generateBytes()` returns synthetic random bytes labelled as JPEGs for byte-range/streaming
tests, so the browser gets a real response it cannot decode. This is fixture design, not a
bug, and it did not affect any layout measurement in this document — no numbers above
depend on artwork having rendered.

**Real code defect.** Home's `ShelfCard` has a working `coverFailed`/`onError` handler that
falls back to a styled, warm on-theme book icon — correct behaviour. Music's Jellyfin
`<img>` tags (artist and album cards) have **no `onError` handling at all**, so a failed
image load renders the browser's native broken-image glyph instead. This is a straight
inconsistency with an already-correct pattern elsewhere in the codebase, not a question for
anyone — see fix list item 2.

**Open design decision, unaffected by the above.** What a missing-artwork placeholder
should look like — `ShelfCard`'s icon fallback, a gradient, a monogram, something else — is
still undecided; giving Music's cards the same `onError` wiring as `ShelfCard` only fixes
the missing handler, not the question of whether `ShelfCard`'s current icon is the right
placeholder. See fix list item 6.

Two of `DESIGN.md`'s specific claims — that theme colour is "derived from the current
artwork" and that it "cross-fades between palettes on track change" — remain unverified by
this pass either way, since no real image ever decoded to derive a colour from.

## 3. What's right — don't touch these

- **The persistent Now Playing side panel at the expanded breakpoint exists and is
  populated correctly.** `home-desktop.png`, `book-detail-desktop.png`, `search-*-
desktop.png`, `music-*-desktop.png` and `settings-desktop.png` all show the right-hand
  panel either idle ("Nothing playing / Play a book to see chapters, speed, sleep timer and
  bookmarks here") or, once something is playing, populated with artwork slot, title,
  author, scrubber, transport controls, playback-rate control, chapter progress and a
  bookmark action — this matches `DESIGN.md`'s `>1240px` row exactly in kind, and, per the
  corrected Finding 2, in surrounding content width too: it sits flush to the viewport edge
  with the content column at ~95% of the space actually available to it.
- **The warm dark neutral surface + amber accent is applied consistently** across every
  surface except the one mobile Now Playing anomaly (Finding 4) — this reads as the
  intended "Claude" warm-neutral reference and the stated `#B8683C` fallback, not a default
  Material blue or a mismatched per-page palette.
- **The compact (mobile) bottom nav bar is clean and consistent**: six icons with labels
  (Home, Books, Podcasts, Music, Search, Settings), a clear filled-pill active state,
  present and behaving identically across Home, Search, Music and Settings.
- **Search's status line ("1 book, 0 podcasts found for 'dune'.")** is a nice touch and
  reads consistently on both viewports — a concrete, specific empty/result summary rather
  than a generic spinner-then-silence.
- **Typographic hierarchy for page titles and section headers is consistent** across all
  six surfaces — "Home", "Search", "Music", "Settings" and section headers like "Continue
  Listening"/"Recently Added"/"Books" all render at the same weight and size wherever they
  appear, in both viewports.
- **The Music album track list is a reasonable structural match for the stated YouTube
  Music reference** — numbered rows, per-row add/favourite actions, track duration — and,
  per Finding 2, its column is not narrower than the space genuinely available to it.
- **Desktop layout, overall (Finding 2).** The nav rail, side panel and content-grid width
  are all close to `DESIGN.md`'s intent; nothing here needed a fix-list entry.

## 4. Ranked fix list

1. **[Defect]** Dock the mini player to the viewport instead of leaving it in ordinary page
   flow, so it can't land below the fold on a tall page, and scope its width to the rail
   rather than overlapping ~140px into the content column. Files: `apps/web/src/
components/Shell.tsx` (the `breakpoint !== 'compact'` `<MiniPlayer>` render) and `apps/
web/src/features/player/MiniPlayer.tsx` plus its CSS (`position: fixed`/`sticky`, width
   scoped to the rail).
2. **[Defect]** Give Music's Jellyfin artist/album card images an `onError` fallback, same
   as Home's `ShelfCard` already implements, instead of the browser's native broken-image
   glyph. Files: the Music artist and album card components under
   `apps/web/src/features/music/` (wherever the Jellyfin `<img>` tags live, alongside
   `MusicHomePage.tsx`/`MusicAlbumPage.tsx`).
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
   when its artwork genuinely fails to load. `ShelfCard`'s current icon fallback (item 2
   above extends the same handler to Music, not a new design) is unlikely to be the
   intended empty state for "beautiful" per the product brief, but picking the replacement
   (gradient, monogram, icon) is a call for the user, not an engineering fix.
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
- **Real artwork rendering** — every image on every surface failed to decode in this
  fake-upstream environment (Finding 6, environment artefact), so the artwork-derived-colour
  and cross-fade claims are neither confirmed nor refuted here.
- **Podcasts, Lyrics, Playlists, Favourites and Requests pages** — outside the six named
  surfaces; not visited in this pass.
- **Light colour scheme** — the browser context was forced to `dark` throughout, per the
  Playwright config's own convention; the light theme was not screenshotted on any surface.

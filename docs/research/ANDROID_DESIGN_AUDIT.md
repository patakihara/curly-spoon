# Android — `docs/DESIGN.md` comparison (phase 10)

Investigated 2026-08-06 against commit `f042d3b`. This is the Android half of the holistic
design comparison `ROADMAP.md` §10 asks for; `docs/research/WEB_DESIGN_AUDIT.md` is the
web half, already merged.

## 0. Method, and its own limits

**There is no JDK, Android SDK, emulator or device on this machine** (`CLAUDE.md`, "Auralis").
`apps/android` compiles on CI only. Every claim below is either:

- **source-verified** — read directly from the Kotlin/Gradle/XML source, or derived from a
  `grep` across the whole `apps/android/app/src/main/java/net/auralis/app/` tree confirming
  a pattern's absence (a negative grep is still a source-verified claim: e.g. "no file in this
  tree calls `NavigationBar(`" is checked, not assumed); or
- **inferred** — a judgement about how compiled, rendered output would look or feel, which
  this environment cannot produce or check.

`docs/ROADMAP.md`'s own "What is actually left" section (as of 2026-08-06) says plainly: **"Do
not substitute a source-level reading for [the visual comparison] — the web pass showed that
reading source and screenshots produced a confidently wrong headline finding that measuring the
live DOM overturned."** That warning is taken seriously here: nothing in this document claims
to have measured Android's rendered output, and every inferred claim is labelled as such rather
than written with the confidence of a measurement. Where the web audit's own headline reversal is
instructive, it is because a plausible read of source/screenshots turned out backwards once the
DOM was actually measured — the risk that applies is that a divergence reported here as large
might, on a real device, look smaller (Compose's default `MaterialTheme` and layout system are
more forgiving than an unstyled HTML page would be) or, just as plausibly, larger (a
`TextButton`-only, icon-less UI reads very differently at 5 inches than described here). Treat
every **inferred** claim below as a hypothesis for the first device/emulator session, not a
settled finding.

What *is* source-verified and does not need a device to be trusted: which components exist,
which don't, what a `MaterialTheme(...)` call actually passes, whether a given file imports a
given API, and what a route table actually contains. Most of this document's substantive
findings are of that kind — structural presence/absence, not visual judgement — which is why a
useful audit was possible here at all.

## 1. Headline: most of the app's structure was decided once, for compile-safety, and never
revisited against `DESIGN.md`

Four things below look like four separate findings. They are one decision, made early and
documented honestly in code comments at the time, that was never escalated as a `DESIGN.md`
divergence:

**`material-icons-extended` was never added as a dependency**, and no icon dependency of any
kind appears anywhere in `apps/android/gradle/libs.versions.toml` or
`apps/android/app/build.gradle.kts` (source-verified: neither file contains the string `icon`
at all). `MiniPlayerBar.kt:28-35`'s own doc comment explains the origin: `Pause` was not
confirmed to be in the bundled `material-icons-core` set, several sources describe it as
requiring the separate `material-icons-extended` artifact, and rather than risk an unresolved
reference the wave "renders every control as plain text." `HomeScreen.kt:130-132` and
`FavoriteToggleButton.kt:17-27` cite the same reasoning independently, for the top bar's actions
and the favourite toggle respectively — this was a considered, repeated call, not an oversight
made once and forgotten.

That decision, followed consistently, is why:

- **No screen has a navigation icon (back arrow).** `grep -rn "navigationIcon"
  apps/android/app/src/main/java/net/auralis/app` returns nothing across all 16
  `TopAppBar(` call sites. Every sub-screen relies entirely on the system/gesture back
  affordance, with zero in-app back button. **Inferred**: on a phone with gesture navigation
  this is unremarkable; on a 3-button-nav device it is a real, if minor, discoverability gap
  next to YouTube Music/Symfonium, which both show a back chevron.
- **Every toggle and action renders as `TextButton`, not the M3 `IconButton`/`Icon` DESIGN.md
  calls for.** `grep -rn "IconButton" apps/android/app/src/main/java/net/auralis/app` returns
  one hit, and it is a doc-comment reference to a hypothetical, not a real usage
  (`FavoriteToggleButton.kt:17`). Play/pause, shuffle, repeat, lyrics, favourite, the top bar's
  Downloads/Requests/Podcasts/Music actions, the episode-order toggle — all text. **Source-
  verified**, directly contradicts `DESIGN.md`'s YouTube Music row: "icon-only toggles instead
  of text tabs."
- **No shape customization exists anywhere.** `grep -rn "RoundedCornerShape\|clip(\|shape ="
  apps/android/app/src/main/java/net/auralis/app` returns nothing. `DESIGN.md`'s shape scale
  (`none 0 · xs 4 · sm 8 · md 12 · lg 16 · xl 28 · full 9999`, artwork at `lg`, Now Playing
  artwork at `xl` morphing to a squircle) is entirely unwired — every `AsyncImage` (album art,
  podcast covers, book covers) renders with Compose Material3's un-customized default shapes,
  i.e. square corners on plain `Image`/`AsyncImage` calls that carry no `Modifier.clip` at all.
  This is plausibly a consequence of the same caution — a shape token system was never built
  for the same reason icons were never added: nobody treated visual polish as unblocking to a
  compiling app — though the doc comments only state the icon reasoning explicitly; the shape
  gap is inferred from the code's total silence on the subject, not from an equivalent comment.

**Recommendation, not a fix applied here**: resolving whether `material-icons-extended` is safe
to add (it is Apache-2.0, AndroidX, the same publisher as `material-icons-core` — see
`docs/research/FDROID_DISTRIBUTION.md` §3 for the FOSS-audit precedent on this exact family of
dependency) is the single highest-leverage next step for closing the DESIGN.md gap on Android.
It was **not added in this wave**: pulling in a new Gradle dependency is exactly the kind of
change this wave's spec forbids doing blind (`CLAUDE.md`'s "pre-install dependencies" rule exists
for concurrent-agent lockfile safety, but the deeper reason not to do it here is that every icon
choice it would unlock is itself a visual judgement call this session cannot verify).

## 2. Headline: there is no full Now Playing surface at all

**Source-verified, and stated in the app's own comments.** `LyricsScreen.kt:44-47`: *"There is
no full Now Playing surface in this app yet — only `MiniPlayerBar` — so this is deliberately the
smaller of the two options the wave's spec offered: a standalone screen ... rather than folding
lyrics into a Now Playing surface that would have to be built from scratch first."*
`PlayerViewModel.kt:46`'s doc comment: *"What the mini player (and, later, a full Now Playing
surface) renders."* `grep -rln "MiniPlayerBar(" apps/android/app/src/main/java/net/auralis/app`
returns exactly two files — the component itself and `HomeScreen.kt` — confirming it renders
nowhere else.

`MiniPlayerBar.kt` (94 lines total) is the entirety of Android's playback UI: a title, a
play/pause `TextButton`, and — music only — shuffle/repeat/lyrics `TextButton`s
(`MiniPlayerBar.kt:49-93`). There is:

- **No progress/seek bar of any kind.** `DESIGN.md`'s YouTube Music row: "thick progress bar
  that thickens further on touch, no playhead dot." Not present, not approximated.
- **No artwork.** `DESIGN.md`: "Now Playing artwork uses `xl` and morphs to a squircle while
  playing." Not rendered at all in `MiniPlayerBar`.
- **No split-view, no expansion, no bottom-sheet-first secondary UI** for chapters, queue, or
  anything else `DESIGN.md`'s Layout table describes for the Now Playing surface at any of the
  three breakpoints (full-screen sheet / split view / persistent side panel).
- **No equaliser glyph or any other playing-state indicator on list rows.** `DESIGN.md`,
  Accessibility: "Colour is never the only signal — playing state also carries an animated
  equaliser glyph." `grep -rln "equaliser\|equalizer\|isCurrentlyPlaying\|nowPlayingTrackId"
  apps/android/app/src/main/java/net/auralis/app` returns nothing; `AlbumDetailScreen.kt`'s
  `TrackRow` (`AlbumDetailScreen.kt:226-` ) has no concept of "this is the track currently
  playing" at all — colour, glyph, or otherwise.

This is the single largest gap against `DESIGN.md` on Android, it is a genuinely visual/
architectural surface this session cannot design blind, and the app's own authors already named
it as unbuilt. **Left alone, named here as the top item for a device-equipped session**: building
a real Now Playing surface (artwork, seek bar, split-view/sheet by breakpoint) is a multi-file,
highly visual undertaking exactly of the kind this wave's spec rules out doing without a way to
see the result.

## 3. Headline: there is no persistent navigation shell — no bottom bar, no rail, and the mini
player disappears the moment you leave Home

**Source-verified.** `grep -rln "NavigationBar\|NavigationRail\|BottomNavigation\|
NavigationSuiteScaffold" apps/android/app/src/main/java/net/auralis/app` returns nothing. Every
one of the app's 16 `TopAppBar(` screens (`AuralisNavHost.kt:138-188`) is a flat
`Scaffold(topBar = ..., content = ...)` reached by pushing onto Compose Navigation's back stack;
there is no persistent chrome surrounding the content at all.

`DESIGN.md`'s Layout table is explicit and has three tiers (bottom bar / rail / expanded rail)
that apply from 0px up — there is no width at which "no persistent navigation" is the specified
state. None of the three tiers exist on Android. The only navigation entry points on the whole
app are four `TextButton`s in `HomeScreen.kt`'s `TopAppBar` (`HomeScreen.kt:133-144`: Downloads,
Requests, Podcasts, Music) — reachable only from Home, not from any other screen — plus
in-feature links (e.g. Music's own top bar linking to Search/Favourites/Playlists/Requests,
confirmed by the `MUSIC_*` routes in `AuralisNavHost.kt:48-52`).

**A second, compounding consequence, also source-verified**: `DESIGN.md` states "The mini player
is always present when something is loaded, docked above the bottom bar or at the foot of the
rail." On Android, `MiniPlayerBar` is wired into exactly one screen's `Scaffold.bottomBar`
(`HomeScreen.kt:149-160`). Navigate to Music, Podcasts, Requests, Downloads, or any detail screen
while something is playing, and the mini player — and with it, the only play/pause control in the
whole app — disappears until you navigate back to Home. This is not a corner case: it is the
normal browsing flow (play something from Home, then go look at an album).

Both of these are structural navigation-architecture questions, not stylistic ones — genuinely
the kind of change that needs to be seen working, not applied blind. **Left alone, named here**:
a real fix needs a shared Scaffold/shell (the Android equivalent of web's `RootLayout`/`Shell`)
that every route composes inside, hosting a persistent bottom bar/rail and the mini player once,
rather than each of the 16 screens each re-deciding for itself.

## 4. Theming — only colour is wired, and it is the wrong colour model

**Source-verified**, `ui/theme/Theme.kt` in full (36 lines): `AuralisTheme` calls
`MaterialTheme(colorScheme = colorScheme, content = content)` at `Theme.kt:35` — **no
`typography` or `shapes` parameter is passed**, so Compose Material3's own defaults apply
everywhere `MaterialTheme.typography.*`/implicit shapes are used (which is everywhere — every
screen references `MaterialTheme.typography.titleMedium` etc., confirmed via
`grep -c "MaterialTheme.typography" apps/android/app/src/main/java/net/auralis/app -r` returning
matches in the majority of screen files). `DESIGN.md`'s Type table (a specific scale built on
`Inter Variable`, with named tracking/weight per role) and Shape scale are simply not present on
Android; the app renders in stock Material3 Roboto-based defaults for both.

More significant than the gap: **`colorScheme` itself does not implement `DESIGN.md`'s colour
model at all.** `Theme.kt:24-30`:

```kotlin
val colorScheme = when {
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
        val context = LocalContext.current
        if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
    }
    darkTheme -> DarkColors
    else -> LightColors
}
```

This is Android's own **Material You / dynamic colour** — derived from the device wallpaper via
`dynamicDarkColorScheme`/`dynamicLightColorScheme` on API 31+, and a plain, unthemed
`darkColorScheme()`/`lightColorScheme()` below that. `DESIGN.md`'s Colour section describes a
completely different pipeline: quantize the **current artwork** to an HCT source colour, build a
`SchemeExpressive`/`SchemeTonalSpot` dynamic scheme from it, cross-fade on track change — the
Symfonium behaviour explicitly named as a top-level reference (`DESIGN.md`'s reference table,
row 2) and already implemented for web via `@material/material-color-utilities`
(`docs/HANDOVER.md` §3: "Colour is derived from artwork at runtime ... the Symfonium behaviour
the user called out"). Android has none of this: the theme colour is wallpaper-derived and
static per app-launch, never changes with what is playing, and is never derived from artwork at
all. This is arguably the single most-cited design reference in the whole project (Symfonium is
one of five named references, and "theme colour from artwork" is its only listed contribution)
and it is entirely absent on Android, not partially implemented.

**No motion/spring system exists on Android.** `grep -rln "spring(\|Animatable\|
animate.*AsState\|Spring\." apps/android/app/src/main/java/net/auralis/app` returns nothing.
`DESIGN.md`'s one spring table (`fast`/`default`/`slow`/`bouncy`, each a stiffness/damping pair)
has no Android counterpart at all — no shape morphing, no cross-fade, no spring-driven list/card
animation. Every transition on Android is whatever Compose Navigation's and Material3's own
un-customized defaults produce.

**None of this is fixed here.** Wiring Android's dynamic-colour-from-wallpaper theme over to an
artwork-derived one is a real architectural change (the artwork-quantization pipeline would need
a Kotlin equivalent of `@material/material-color-utilities`'s usage in `packages/ui`, plus a
place to hook "current playing item's artwork changed" — which barely exists yet, since there is
no Now Playing surface holding artwork at all, per §2). Adding `typography`/`shapes` parameters
to the one `MaterialTheme(...)` call is closer to mechanical, but choosing the actual values is a
visual decision (what does `Inter Variable` render as on this font stack, does the M3 shape scale
read right against Compose's spacing) that this session cannot check — left named, not applied.

## 5. Per-surface notes

Surfaces not called out below have no additional finding beyond what §§1-4 already cover — they
follow the same TopAppBar/TextButton/no-shape/no-motion pattern uniformly, which is itself worth
noting positively: **the component-level styling that does exist (`MaterialTheme.colorScheme`/
`MaterialTheme.typography` references, consistent `Scaffold`+`TopAppBar` structure, consistent
error-state red/retry patterns) is applied consistently across all 16 screens.** Spot-checked
`RequestsScreen.kt`, `DownloadsScreen.kt`, `PlaylistsScreen.kt`, `FavoritesScreen.kt`,
`PodcastsScreen.kt` — all source-verified to follow the same `Scaffold(topBar = { TopAppBar(...)
})` shape and reference `MaterialTheme.colorScheme.error`/`MaterialTheme.typography.*` rather
than a hardcoded value. The gaps here are structural/absent-feature gaps, not sloppy or
inconsistent styling of what does exist.

- **Home** (`HomeScreen.kt`). Horizontally-scrolling shelves (`LazyRow` per shelf,
  `HomeScreen.kt:186-231`) match `DESIGN.md`'s and web's shelf pattern structurally. Cover art
  is `120.dp` (line 200), well above the 48dp touch-target floor. The four top-bar text actions
  (§1) and the single-screen mini player (§3) are this surface's contribution to the headline
  findings above; nothing surface-specific beyond that.
- **Library/browse, Artist, Album** (`MusicLibraryScreen.kt`, `ArtistDetailScreen.kt`,
  `AlbumDetailScreen.kt`). Row/grid patterns are consistent with Home's. `AlbumDetailScreen.kt`'s
  `TrackRow` has no now-playing indicator (§2). Cover sizes: 56dp (library rows), 96dp (album/
  podcast headers) — both above 48dp, both plain rectangles (no shape, §1).
- **Search** (`MusicSearchScreen.kt`). **Source-verified, a real cross-platform gap**: this
  screen is reachable only from `MusicLibraryScreen`'s own top bar (`MUSIC_SEARCH` route,
  `AuralisNavHost.kt:154`) and searches only Jellyfin artists/albums/tracks
  (`MusicSearchScreen.kt:36`: *"Search across the connected Jellyfin library's artists, albums
  and tracks"*). Web's `apps/web/src/features/search/SearchPage.tsx` is a **unified** search
  covering books, podcasts and music together in one field with three sections
  (`SearchPage.tsx:116-259`: `search-results-books`/`search-results-podcasts`/
  `search-results-music` test ids). Android has no audiobook or podcast search at all, and no
  top-level search entry point outside the Music section. `DESIGN.md`'s Spotify reference —
  "Search that goes deep — one field, typed results" — describes web's shape, not Android's.
  Lyrics search specifically is unimplemented on **both** platforms (a named, blocked product
  decision per `docs/HANDOVER.md`/`ROADMAP.md`, not an Android-specific gap), so that half of
  the Spotify reference is fairly compared as "neither platform has it" — the unified-scope gap
  is the real, Android-only finding. **This is a product-scope question** (should Android's
  search cover books/podcasts too, matching web) as much as a design one — named here rather
  than decided.
- **Player / Now Playing, Lyrics** — covered in §2 and its own paragraph above.
  `LyricsScreen.kt`'s synced-lyrics list (`LyricsScreen.kt:186-203`) is otherwise a reasonable,
  independent implementation of `DESIGN.md`'s Spotify/lyrics intent — auto-scroll-with-pause on
  manual drag (`MANUAL_SCROLL_PAUSE_MS`, `LyricsScreen.kt:35`), active-line emphasis via colour
  and weight. **One fix applied here** (§6below): its active/inactive line sizing was two
  hardcoded `fontSize` literals rather than a `MaterialTheme.typography` role, the one
  unambiguous type-size defect found in the whole tree.
- **Playlists, Favourites** (`PlaylistsScreen.kt`, `FavoritesScreen.kt`,
  `PlaylistDetailScreen.kt`). Structurally consistent with Album/Library; `FavoriteToggleButton`
  (§1) is the shared control across all four favouriting surfaces (track rows, album header,
  artist header, `FavoritesScreen` itself) — one component, applied consistently, so a future
  icon fix in one place fixes all four.
- **Requests, Music requests** (`RequestsScreen.kt`, `MusicRequestsScreen.kt`). Same
  Scaffold/TopAppBar/error-colour pattern as everywhere else; no surface-specific finding beyond
  §§1-4.
- **Podcasts** (`PodcastsScreen.kt`, `PodcastDetailScreen.kt`). Episode-order toggle
  (`PodcastDetailScreen.kt:154-169`) is a `Button` labelled with the **destination** action
  ("Show oldest first" while sorted newest-first), explicitly to avoid the "label states what's
  already true" trap its own comment names (`PodcastDetailScreen.kt:160-164`). Worth flagging a
  nuance in `FavoriteToggleButton.kt:30-34`'s doc comment, which lists this control alongside
  `MiniPlayerBar`'s play/pause toggle as sharing "the same gap" (missing `Role.Switch`/
  `stateDescription`). **Inferred, not applied as a fix**: that framing is arguably imprecise —
  both controls already name the *action* in their visible label (an M3-conventional pattern for
  a two-state action button, not a switch), so adding `Role.Switch`/`stateDescription` to either
  would risk announcing state information that contradicts the action-phrased label a screen
  reader also hears. Left alone rather than "fixed" per that comment's suggestion, because
  resolving it correctly is a screen-reader UX judgement call, not a mechanical addition.
- **No book/audiobook detail screen exists.** Already known and recorded
  (`docs/ROADMAP.md:439`: "no book-detail screen exists yet"; `HomeScreen.kt:53-55`'s own doc
  comment repeats it) — not re-reported as new here, only cross-referenced since it bears
  directly on §3's "no persistent shell" finding: there is nowhere for a persistent mini player
  or nav bar to be *tested against* a book flow yet, only music/podcast flows.
- **Settings — does not exist on Android at all.** **Source-verified**: `find
  apps/android/app/src/main/java/net/auralis/app -iname "*settings*"` matches only
  `data/settings/ServerConfigRepository.kt` (server URL/token storage, no UI) — there is no
  `SettingsScreen.kt`, no `Routes.SETTINGS`, nothing reachable from any top bar. Web has a
  Settings page (source colour, theme mode — referenced in `docs/ROADMAP.md`'s web-audit section
  on stale Settings copy). This is a straightforward **missing on Android what web has** gap,
  not a design-language question — named here as a product/scope item for the roadmap, not
  fixed in this wave (a Settings screen is new UI, squarely outside "unambiguous fixes").

## 6. Fixes applied (blind-safe only)

One fix, in the one class this wave's spec allows without seeing the result: a hardcoded type
size duplicating an already-established `MaterialTheme.typography` pattern used everywhere else
in the tree.

- **`apps/android/app/src/main/java/net/auralis/app/features/player/LyricsScreen.kt`** (was
  `LyricsScreen.kt:193`): the active/inactive lyric line used two literal `fontSize` values
  (`20.sp`/`16.sp`) instead of a `MaterialTheme.typography` role, the only spot in the entire
  Android tree doing this (`grep -rn "\.sp\b" apps/android/app/src/main/java/net/auralis/app`
  returned exactly this one hit before the fix, and none after). Every other screen in the app
  sizes text via `MaterialTheme.typography.titleMedium`/`bodySmall`/etc.
  (`HomeScreen.kt:183/215`, `MusicSearchScreen.kt:131/149/167`, `AlbumDetailScreen.kt`'s
  `TrackRow`, and more), so this was a genuine, single-instance inconsistency with an
  already-established sibling pattern, not a fresh design opinion. Changed to
  `style = MaterialTheme.typography.titleLarge` (active line) /
  `MaterialTheme.typography.bodyLarge` (inactive line) — the closest M3 roles to the original
  22px-ish/16px intent (M3's default `titleLarge` is 22sp, `bodyLarge` is 16sp, matching the
  inactive line's original literal exactly) — with `fontWeight`/`color` kept as explicit
  overrides on top, since those two already varied per-state for a documented reason (active-line
  emphasis) and are not literal-value defects. The now-unused `androidx.compose.ui.unit.sp`
  import was removed in the same change.

  **Why this was safe to make blind**: it changes which typography *role* renders, not layout,
  spacing, or anything requiring a rendered check — the sizes chosen are Compose Material3's own
  standard scale values (not invented numbers), and the pattern of "use a `MaterialTheme.typography`
  role, not a literal `.sp`" is the codebase's own, already-universal convention this file was the
  sole exception to.

No other change in this class was found. Every `contentDescription = null` in the tree
(`MusicLibraryScreen.kt:295`, `AlbumDetailScreen.kt:168`, `PodcastDetailScreen.kt:140`,
`HomeScreen.kt:196`, `PodcastsScreen.kt:169`, `DownloadsScreen.kt:110`) was checked individually:
each is a cover-art `AsyncImage` sitting directly beside a visible `Text` title in the same row
(confirmed by reading the surrounding `Row`/`Column` in each file) — correctly decorative, not a
missing-description defect. No `.size(...)` call below 48dp was found
(`grep -rn "\.size(" apps/android/app/src/main/java/net/auralis/app` — smallest is 56dp, all on
non-interactive-adjacent cover art). No raw `Color(0x...)` or named-colour literal
(`Color.Red`/`Gray`/etc.) exists anywhere in the tree. No hardcoded UI string duplicates an
established resource-driven pattern — `strings.xml` holds exactly two entries
(`app_name`, a notification-channel name, both system-required strings), and **every** UI string
in every Compose screen is a Kotlin literal; that is the codebase's own uniform, if unusual for a
production Android app, convention, so converting any one screen's strings to `R.string` would be
the actual inconsistency. Worth flagging as an internationalization gap for later (named, not
fixed): this app cannot be localized without a resource-extraction pass across the entire UI.

## 7. Summary

| Class | Verdict |
| --- | --- |
| Now Playing surface (§2) | Missing entirely — DESIGN.md's largest single ask, unbuilt, self-acknowledged in code. Named for a device session. |
| Persistent nav shell + always-present mini player (§3) | Missing entirely — every screen is independent TopAppBar+backstack; mini player lives only on Home. Named for a device session. |
| Theming — colour model (§4) | Wrong model, not just unfinished: wallpaper-derived Material You, not artwork-derived per DESIGN.md/Symfonium. Named. |
| Theming — type/shape/motion (§4) | Entirely unwired; stock Compose Material3 defaults throughout. Named. |
| Icon-only controls (§1) | Deliberately avoided app-wide for a real, documented reason (unconfirmed icon dependency). Root cause of most surface-level DESIGN.md divergence. Recommendation given, not applied. |
| Search scope (§5) | Music-only on Android vs. unified on web — a product-scope question, named for the user. |
| Settings screen (§5) | Does not exist on Android — missing what web has. Named. |
| Component-level styling consistency | Good — MaterialTheme tokens used consistently everywhere they're wired at all; no hardcoded colours, no sub-48dp targets, no styling inconsistency between sibling screens. |
| Blind-safe fixes | One: `LyricsScreen.kt`'s hardcoded `fontSize` → `MaterialTheme.typography` role (§6). |

**Everything reported as "missing" or "wrong" above is source-verified — checked by reading the
file or by a whole-tree grep proving absence, not inferred from expectation.** Everything that
would require judging how it *looks* (whether the gaps above read as jarring on a real screen,
whether Compose's default type/shape actually clashes with `DESIGN.md`'s intent in practice, any
spacing/layout opinion) is explicitly labelled inferred and left alone, per this wave's
instructions. **No emulator or device exercised any of this app during this audit** — that
remains the single biggest gap in this document itself, not just in the app.

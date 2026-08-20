# Now Playing, mini player and queue — shared behaviour spec (wave 16e-nowplaying)

Status: **spec only, nothing implemented against it yet.** This is the shared spec both
`16e-nowplaying-W` (web) and `16e-nowplaying-A` (Android) build from, independently, followed by a
`16e-nowplaying-P` parity review by an agent that wrote neither half. Per `ROADMAP.md` §16, this is
the fifth 16e screen (after book detail, podcast detail, album detail, search). Unlike those four
this is not one screen but **one surface family that shares state and transitions**: the docked
mini player, the full Now Playing surface, the queue, and lyrics. They are specced together
because a control built in one has to keep working when the surface around it changes shape.

**This is the largest legitimate platform divergence in the app, and drawing that boundary
correctly is this document's main job.** Web has a **persistent docked side panel** at
`expanded` width (`>= 1240px`), a **sheet** below that, and a **docked mini player** at every
width except `compact`; Android has a **full-screen overlay** for Now Playing at every width (no
docked-panel concept exists at all) and a **docked mini player bar** above the nav chrome. §3
rules this **idiom, not drift** — but everything _inside_ each shape (what a control does, what
gets announced, what the queue shows, how shuffle/repeat/lyrics behave) must not differ, and §2's
recon finds several places where it already does, unintentionally.

This document uses literal example strings throughout, checkable against the real e2e fixture
(`apps/server/src/testSupport/fakes/fakeJellyfin.ts`, `fakeAudiobookshelf.ts`), per the correction
`16e-book-P` recorded and every triple since has confirmed: two agents that never see each other's
work converge exactly on a literal string or a table row, and drift wherever a value is left to
prose.

---

## 1. What this surface family is for

1. **Always show what's playing, from anywhere in the app** — the mini player, docked whenever
   something is loaded.
2. **Full transport and detail on demand** — Now Playing: artwork, title/artist/chapter, seek,
   skip, shuffle/repeat (music only), playback speed, sleep timer.
3. **See and manage what's next** — the queue, scoped to whichever content type (music, podcast,
   audiobook) is currently loaded; only one is ever "live" (`docs/ROADMAP.md` §12f).
4. **Read along** — synced or plain lyrics for a Jellyfin music track, the Spotify-referenced
   feature Sofia named specifically as something she loves (`docs/USER_DECISIONS.md`).

Not this document's concern: `ChapterList.tsx`/`BookChapterRow` (audiobook chapters — covered by
`BOOK_DETAIL.md`), `BookmarkControls.tsx`, `SleepTimerControl.tsx` (bookmarks and the sleep timer
picker itself — unchanged, restyle only, not respecced here), or anything upstream of what's
already loaded (album/podcast/book detail screens, already specced).

---

## 2. Content inventory — what each platform shows today

**Evidence, read in full.** Web: `apps/web/src/features/player/MiniPlayer.tsx` (100 lines),
`NowPlaying.tsx` (243 lines), `QueueView.tsx` (174 lines), `LyricsView.tsx` (117 lines),
`components/NowPlayingPanel.tsx` (40 lines). Android:
`apps/android/.../features/player/MiniPlayerBar.kt` (113 lines), `NowPlayingScreen.kt` (195
lines), `QueueScreen.kt` (123 lines), `LyricsScreen.kt` (202 lines),
`navigation/AuralisShell.kt` (the wiring, read in relevant part).

### 2.1 Mini player

| Content / control | Web today                                                                                                  | Android today                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Where it renders  | `Shell.tsx:266,373` — whenever `breakpoint !== 'compact'`, i.e. at **both** `medium` and `expanded` widths | `AuralisShell.kt:150` — always, whenever `PlayerUiState.Playing`, at every width                                                         |
| Cover art         | `CoverImage`, 48px, per-kind fallback icon (`MiniPlayer.tsx:66-76`)                                        | **absent entirely** — `MiniPlayerBar.kt` has no `AsyncImage`/art of any kind                                                             |
| Title             | `Marquee` (auto-scrolls if it overflows), `mini-player-title` (`:78-80`)                                   | Plain `Text`, `maxLines = 1`, no marquee/overflow handling (`:61`)                                                                       |
| Author / artist   | `mini-player-author`, shown when present (`:81-85`)                                                        | **absent entirely** — no subtitle line at all                                                                                            |
| Play/pause        | `IconButton`, standard 48px (`:88-94`)                                                                     | `IconButton`, standard M3 default size (`:106-111`)                                                                                      |
| Progress          | `LinearProgress`, non-interactive, `progress = currentTime/duration` (`:95-97`)                            | **absent entirely** — no progress indicator of any kind on the bar                                                                       |
| Shuffle / repeat  | **absent from the mini player** — only in the expanded Now Playing surface (§2.2)                          | Present, music-only (`state.isMusic`), `Role.Switch` + `stateDescription` for shuffle, worded `contentDescription` for repeat (`:62-96`) |
| Lyrics affordance | **absent from the mini player** — `LyricsView` only renders inside the expanded Now Playing surface (§2.2) | Present, music-only, `Icons.Filled.Subtitles`, navigates to a **separate route** `Routes.LYRICS` (`:97-104`, `AuralisShell.kt:154`)      |
| Tap-to-expand     | Whole body except the play button opens Now Playing (`:59-87`)                                             | Whole row except the controls opens Now Playing (`Modifier.clickable(onClick = onExpand)`, `:57`)                                        |

**Sonora's own `MiniPlayer` prop table is richer than either platform's current bar**
(`SONORA.md:501`): `title, artist, image, playing, onTogglePlay, onOpen, platform, progress,
onSeek, duration, onPrev, onNext, queueOpen, onToggleQueue`. §7 rules on which of these gaps this
triple closes and which it does not — do not read the prop list as a checklist to implement
wholesale.

### 2.2 Now Playing (the expanded surface)

| Content / control              | Web today                                                                                                                                                             | Android today                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape                          | `Sheet` (compact: 1 detent/full; medium: 0.9 detent) below `expanded`; embedded directly, no chrome, at `expanded` (`NowPlaying.tsx:229-242`, `NowPlayingPanel.tsx`)  | **Always** a full-screen `Surface` overlay (`AnimatedVisibility` in `AuralisShell.kt:187-198`) — no docked-panel shape at any width                   |
| Close/collapse                 | `IconButton`, `close` glyph, top-left (`:110-112`)                                                                                                                    | `IconButton`, `Icons.AutoMirrored.Filled.ArrowBack` (`:105-107`)                                                                                      |
| Cover art                      | `<img>`, 640px request width, `alt=""` (`:115-123`)                                                                                                                   | `AsyncImage`, `fillMaxWidth().aspectRatio(1f)`, `RoundedCornerShape(28.dp)`, `contentDescription = null` (`:115-124`)                                 |
| Title                          | `<h1>`, real heading role (`:126`)                                                                                                                                    | `Text`, `headlineMedium`, **no `Modifier.semantics { heading() }`** — not marked as a heading at all (`:128`)                                         |
| Author / artist / track artist | `now-playing-author`, `secondary` from `playerDisplayMeta` (§2.4) (`:127-131`)                                                                                        | `resolveSubtitle(artist, subtitle)` (`NowPlayingFormat.kt:83-86`) (`:129-131`)                                                                        |
| Current chapter (audiobook)    | `now-playing-chapter`, always rendered (empty string if none) (`:132`)                                                                                                | **absent entirely** — no chapter indicator anywhere in `NowPlayingScreen`                                                                             |
| Scrubber                       | `Slider`, real seek, `valueText` announces `"{elapsed} of {duration}"` (`:135-144`)                                                                                   | `Slider`, real seek with drag-vs-tick arbitration (`sliderFraction`/`isDragging`, `:94-100,135-146`) — same behaviour, no `valueText`/announced label |
| Elapsed / remaining            | `player-elapsed` / `player-remaining`, `formatRemaining` always `"-{time}"` (`playerUi.ts:26-28`)                                                                     | `elapsedTimeLabel` / `remainingTimeLabel`, `"-{time}"` but `"--:--"` when duration unknown (`NowPlayingFormat.kt:56-73`)                              |
| Skip back / forward            | Configurable seconds (`settingsStore.skipBackSeconds`/`skipForwardSeconds`, default **30/30**), labelled `"Skip back {n} seconds"` (`NowPlaying.tsx:152-158,167-173`) | **Fixed 10s back / 30s forward**, not configurable, labelled `"Skip back 10 seconds"` (`:49-50,165-173`)                                              |
| Play/pause                     | `IconButton variant="filled"` — already reads `--accent`/`--accent-contrast` (16c-1/16c-2) (`:159-166`)                                                               | Plain M3 `IconButton`, no filled/accent treatment (`:174-179`)                                                                                        |
| Previous / Next track (music)  | **absent** — no prev/next controls anywhere in `NowPlaying.tsx`                                                                                                       | Present, `Icons.Filled.SkipPrevious`/`SkipNext` (`:162-164,189-191`) — calls `skipToNext`/`skipToPrevious`, gating unclear (see §6)                   |
| Shuffle                        | `IconButton`, `selected={queue.shuffled}`, gated `currentItem.media.kind === 'track' && queue !== null` (`:176-185`)                                                  | **absent entirely from this screen** — only reachable via the mini player before expanding (§2.1)                                                     |
| Repeat                         | `IconButton`, dynamic `aria-label` (3-state), `"1"` badge when repeat-one (`:186-198`)                                                                                | **absent entirely from this screen** — same gap as shuffle                                                                                            |
| Lyrics affordance              | `LyricsView` rendered **inline**, always present in the scroll stack, self-gates on `kind === 'track'` (`:224`)                                                       | **absent entirely from this screen** — only reachable via the mini player, and only while collapsed (§2.1)                                            |
| Queue                          | `QueueView` rendered **inline**, always present in the scroll stack (`:202`)                                                                                          | **A separate route**, `Routes.QUEUE`, reached via a header `IconButton` (`:108-110`)                                                                  |
| Playback speed                 | `player-rate`, cycles `[0.75, 1, 1.25, 1.5, 1.75, 2]` (`:204-219`, `playback.ts:76-87`)                                                                               | **absent from this screen** — no speed control anywhere in the Android player UI                                                                      |
| Sleep timer                    | `SleepTimerControl`, inline (`:220`)                                                                                                                                  | **absent from this screen** — no sleep timer anywhere in the Android player UI                                                                        |
| Chapters (audiobook)           | `ChapterList`, inline (`:223`)                                                                                                                                        | **absent from this screen** — reached instead from `BookDetailScreen` only                                                                            |
| Bookmarks                      | `BookmarkControls`, inline (`:225`)                                                                                                                                   | **absent from this screen**                                                                                                                           |

**Speed, sleep timer, chapters and bookmarks being Android-absent is pre-existing and out of
scope for this triple** (§7) — none of them are part of Sonora's own player mock either (checked:
the mock's "Now" tab and mobile sheet show a Speed _readout_ and a Sleep _readout_, both
non-interactive placeholders with no `onClick`, §3). **Prev/Next, shuffle, repeat and the lyrics
affordance are different: Android already has three of the four (prev/next in `NowPlayingScreen`,
shuffle/repeat/lyrics in `MiniPlayerBar`) and loses shuffle/repeat/lyrics the moment the user
expands.** That is a real, closable gap — §6 and §10 fix it, and §7 says explicitly why prev/next
staying Now-Playing-only (not added to web) is not the same kind of gap.

### 2.3 Queue

| Content / control         | Web today                                                                                                       | Android today                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Location                  | Inline inside Now Playing's scroll stack — no separate route (`NowPlaying.tsx:202`)                             | Separate screen, `Routes.QUEUE`, its own `TopAppBar` titled `"Queue"` (`QueueScreen.kt:85-98`)                        |
| Row: title                | `ListItem` `headline` (`QueueView.tsx:164`)                                                                     | `ListItem` `headlineContent` (`QueueScreen.kt:109`)                                                                   |
| Row: subtitle             | `ListItem` `supportingText` — artist/podcast title/book title, or `undefined` (`:165`)                          | `ListItem` `supportingContent` — same three sources via `QueueRowUi.subtitle`, or `null` (`:110`)                     |
| Row: cover art            | **absent entirely** — no thumbnail on any queue row                                                             | **absent entirely** — same                                                                                            |
| Row: currently-playing    | `ListItem selected={entry.current}` → visual treatment + `aria-current="true"`, **no visible text** (`:166`)    | `Text("Now playing", labelMedium)` as `trailingContent`, **visible text label**, no background highlight (`:111-116`) |
| Row: background highlight | **absent** — whatever `ListItem`'s own `selected` styling resolves to today (still `--m3-*`, per `HANDOVER.md`) | **absent entirely**                                                                                                   |
| Empty state               | Per-content-type message, e.g. `"Nothing queued after this track."` (`QueueView.tsx:44-48`)                     | Per-content-type message, near-identical wording (`QueueScreen.kt:77-83`) — see §6 for the one wording difference     |
| Clear queue               | `Button` with `close` leading icon, `"Clear queue"` label, in the section header (`:131-141`)                   | `IconButton`, `Icons.Filled.ClearAll`, `"Clear queue"` `contentDescription`, in the `TopAppBar` (`:90-96`)            |
| Header                    | `<h2>{title}</h2>` inline, e.g. `"Music queue"` (`:130`, `TITLES` at `:38-42`)                                  | `TopAppBar` title is the literal string `"Queue"` always — no per-content-type title                                  |

**One asymmetry already present and out of scope here:** web's queue header names the content
type (`"Music queue"`); Android's names nothing (`"Queue"`, TopAppBar, every content type). §7
names this explicitly so nobody "fixes" it as a side effect of the restyle — see that section for
why it stays.

### 2.4 Lyrics

| Content / control              | Web today                                                                                                                     | Android today                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Location                       | Inline inside Now Playing's scroll stack (`NowPlaying.tsx:224`)                                                               | Separate screen, `Routes.LYRICS`, reached from `MiniPlayerBar` only (§2.1, §2.2's gap)                               |
| Gate                           | `currentItem.media.kind === 'track'`, renders `null` otherwise (`LyricsView.tsx:30,60`)                                       | `playing?.isMusic`, else a `"Not playing music right now."` message (`LyricsScreen.kt:94-99`)                        |
| Loading                        | Three `Skeleton` rectangles (`:63-69`)                                                                                        | `CircularProgressIndicator` (`:101-104`)                                                                             |
| Error                          | `"Couldn't load lyrics."`, `role="alert"` (`:72-78`)                                                                          | `"Couldn't load lyrics."`, plain text, same copy (`:106`)                                                            |
| No lyrics for track            | `"No lyrics for this track."`, plain text (not an alert) (`:80-88`)                                                           | `"No lyrics for this track."`, same copy, same non-alert treatment (`:110-113`)                                      |
| Line styling — active vs. rest | **Two states only**: active (`--m3-on-surface`, weight 600) / inactive (`--m3-on-surface-variant`) (`app.css:984-993`)        | **Two states only**: active (`colorScheme.primary`, `titleLarge`, bold) / inactive (`onSurfaceVariant`, `bodyLarge`) |
| Unsynced lyrics                | All lines rendered plain, none ever marked active (`lyrics.synced` gate, `:99`)                                               | Same — `synced` gates `activeLineIndex` entirely (`:177`)                                                            |
| Auto-scroll                    | `scrollIntoView({ block: 'center' })`, respects reduced motion (`:52-58`)                                                     | `animateScrollToItem`, pauses 3s after a manual drag (`MANUAL_SCROLL_PAUSE_MS`, `:39,164-183`)                       |
| Live region                    | Deliberately none, both platforms — an active-line live region would re-announce every few seconds (both files' own comments) | Same                                                                                                                 |

**Sonora specifies a THREE-state lyric line treatment, and neither platform has it** — see §3.

---

## 3. The Sonora treatment

**Authority: `docs/design/sonora/Auralis-Redesign.dc.html`**, read directly — this screen has no
single `player:` entry in the `screens` map (`:608`); its markup is inline in the app frame
itself (desktop: `:205-259`; mobile: `:376-431`), always present rather than switched on `go()`.

### 3.1 The idiom ruling — read this before anything else in this section

**Sonora's desktop mock (`:205-231`) is a _tabbed_ 320px side panel** — "Now playing" / "Queue" /
"Lyrics" tab strip (`:208-212`), one tab's content visible at a time (`panelIsNow`/`panelIsQueue`/
`panelIsLyrics`, `:213,233,247`), no scrolling between them. **This app's `expanded`-width panel is
a single scrolling stack showing all of it at once** (`NowPlaying.tsx:104-227`) — transport, queue
_and_ lyrics all visible by scrolling, never hidden behind a tab.

**Ruling: keep the existing stacked-scroll structure on both platforms. Do not build Sonora's
tabbed panel.** Three reasons, stated so nobody re-litigates this mid-implementation:

1. Every prior 16e triple kept each screen's existing control flow and added Sonora's visual
   language plus a small number of clearly-named new affordances (`BOOK_DETAIL.md`'s chapters,
   `ALBUM_DETAIL.md`'s clickable subtitle) — none rebuilt navigation. A tabbed panel is a bigger
   behavioural change than any of those, on the single busiest surface in the app.
2. Nothing is hidden behind a tab today; that is arguably a _better_ affordance than Sonora's mock
   for a returning user who wants to glance at both the queue and the lyrics without an extra tap.
3. `SONORA.md` itself doesn't claim a reusable primitive here — its own inventory says plainly:
   `"Sheet: No Sonora equivalent named — Now Playing expansion exists in the redesign screens but
as bespoke screen markup, not a reusable Sheet primitive"` (`SONORA.md:526`, `packages/ui`
   export-inventory table). The mock is illustrative, not a structural contract.

**Sonora's mobile sheet (`:384-431`) is a single scrolling stack** — header, art, title/artist,
scrubber, transport, speed/sleep, an inline `"Lyrics"` section, then an inline `"Up next"` section
— which is the _same_ shape web's `Sheet`/compact `NowPlaying` already has. Use it directly for
geometry (§3.3); no ruling needed there, web already matches Sonora's own structure at that width.

**Android's full-screen-overlay-always shape is idiom, not drift**, for the same reason
`16d-P` ruled Android's bottom-tab-bar-vs-nav-rail difference idiom: it is this platform's
established, working convention (`AuralisShell.kt`'s `AnimatedVisibility` predates this wave), it
satisfies the same requirement (full transport + detail, reachable in one tap from the mini
player), and nothing in `SONORA.md` mandates a docked side panel exist on Android — Sonora's own
mock has no Android/mobile-app frame separate from its "mobile web" frame at all.

**The mobile sheet's queue-icon header button, and its `goQueue` handler, are a mock
inconsistency — do not build against it literally.** `:392`'s `IconButton label="Queue"
onClick="{{ goQueue }}"` calls `goQueue: () => this.setState({ panel: 'queue' })` (`:830`) — a
state flag the _mobile_ layout never reads (only the desktop panel's `sc-if` blocks check `panel`,
`:233,247`). Read as intent, not literal wiring: the mobile sheet wants a way to jump straight to
the queue from its header, same as Android's own `NowPlayingScreen` already has (§2.2) and web's
sheet currently lacks (queue is reachable only by scrolling down). §6 states the actual behaviour.

### 3.2 Geometry — mini player

| Token                     | Value                                                                                                                                                                                                   | Web (`-W`)                                                                                                                                                                                                                                                            | Android (`-A`)                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover art size            | `44px` (`--miniplayer-album-size`, `SONORA.md:221`)                                                                                                                                                     | **Wrong value, and the token exists unused** — `MiniPlayer.tsx:73` hardcodes `size={48}`; `packages/ui/src/styles/sonora-tokens.css:98` already emits `--miniplayer-album-size: 44px`, zero consumers anywhere in the tree. Read the token, don't hardcode 44 either. | **Missing entirely** — no art on the bar at all (§2.1); add at `44.dp`                                                                                                          |
| Bar height (desktop/wide) | `82px` (`MiniPlayer` `hint-size`, `:258`)                                                                                                                                                               | Current height unspecified/implicit — set explicitly to match                                                                                                                                                                                                         | N/A — Android has one bar height, not a desktop/mobile split; use the mobile value below                                                                                        |
| Bar height (mobile)       | `88px` (`MiniPlayer` `hint-size`, `:379`)                                                                                                                                                               | N/A — web's `medium`/`compact` mini player height is currently implicit; leave as-is unless it visibly conflicts with the restyle                                                                                                                                     | Set `MiniPlayerBar`'s row to `88.dp` (its own literal, matching Sonora's one mobile value — Android has no desktop bar)                                                         |
| Title/artist typography   | Title weight 600, artist muted, no literal size pinned by the mock's own CSS (`:322-323` describes the _queue row_, not the MiniPlayer primitive itself — MiniPlayer's own source isn't vendored, §3.4) | Read from context (`TrackRow`/queue-row conventions): not pinned precisely — use `--text-md` weight 600 title / `--text-sm` muted artist, consistent with every other row-shaped primitive in `SONORA.md` §3                                                          | Same values, `dp`-read (`16b-2-A`'s established 1:1 reading), no existing Android type-scale name maps exactly — use `bodyMedium` weight 600 / `bodySmall` muted                |
| Progress indicator        | Present, `LinearProgress` (already exists), non-interactive                                                                                                                                             | Already correct — keep, restyle colour only (off `--m3-*` if not already migrated; check `LinearProgress`'s own `16c`-remaining-consumer status before assuming)                                                                                                      | **New** — add a slim progress indicator to the bar; Compose `LinearProgressIndicator`, non-interactive, matching web's non-seekable behaviour (§7 rules out making it seekable) |

**`MiniPlayer`/`TrackRow` are two of the six Sonora primitives never vendored**
(`docs/design/sonora/primitives/README.md`) — their real source values (padding, exact colours,
hover/press states) are **not available**, only the prop-name lint inference in `SONORA.md` §4.
**Say so, don't invent them.** Where this table has no pinned value, use this app's own existing
row-shaped conventions (`ListItem`, `TrackRow` per the album/podcast/book triples) rather than
guessing at Sonora's unseen source.

### 3.3 Geometry — Now Playing surface

| Token                              | Value                                                                                                                                                                                                                                         | Web (`-W`)                                                                                                                                                       | Android (`-A`)                                                                                                                                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art tile, expanded/desktop panel   | Fills panel width (320px minus padding), `border-radius: var(--radius-md)` = `24px` (`:210`)                                                                                                                                                  | **Missing** — plain `<img>`, no radius (`:115-123`); apply at `expanded` only, this row is panel-scoped                                                          | N/A — Android has no docked-panel width; use the compact/sheet row below at every width                                                                                                                        |
| Art tile, compact/mobile sheet     | `aspect-ratio:1`, full width, `border-radius: var(--radius-lg)` = `32px` (`:394`)                                                                                                                                                             | **Missing** — same `<img>`, no radius; apply at `compact`/`medium`                                                                                               | **Missing** — currently `RoundedCornerShape(28.dp)` (`:123`), close but not the token value; correct to `32.dp`                                                                                                |
| Title, desktop panel               | `var(--font-display)`, weight 900, `--text-2xl` (`20px`) (`:213`)                                                                                                                                                                             | **Missing** — plain `<h1>`, no display font/weight/size (`:126`)                                                                                                 | N/A — see above                                                                                                                                                                                                |
| Title, mobile sheet                | `var(--font-display)`, weight 900, `--text-4xl` (`28px`) (`:388`)                                                                                                                                                                             | **Missing** — same `<h1>`                                                                                                                                        | **Missing** — `headlineMedium` (`:128`), not weight-900/display-font-pinned; correct to match                                                                                                                  |
| Artist/subtitle, desktop panel     | `--text-md` (`14px`), `--surface-fg-muted` (`:214`)                                                                                                                                                                                           | **Missing** — plain `<p>` (`:128-131`)                                                                                                                           | N/A                                                                                                                                                                                                            |
| Artist/subtitle, mobile sheet      | `--text-lg` (`16px`), `--m3-on-surface-variant` (`:389`)                                                                                                                                                                                      | **Missing** — same `<p>`                                                                                                                                         | **Missing** — `titleMedium` (`:130`); correct size/colour role                                                                                                                                                 |
| Context line ("Playing from X")    | `--text-sm` (`13px`), `--surface-fg-muted`, desktop panel only (`:215`) — **new content**, §6                                                                                                                                                 | **Missing entirely** — no equivalent line exists                                                                                                                 | N/A — Android's context need is the chapter indicator instead, §2.2/§6                                                                                                                                         |
| Transport icon sizes, mobile sheet | Shuffle/Repeat `48px` (muted), Prev/Next `56px`, Play/Pause `72px` (`:397-401`)                                                                                                                                                               | **Uniform 48px today** (`IconButton`'s fixed `TOUCH_TARGET_MIN`, `packages/ui/.../spacing.ts:18`) — needs a new size capability, see below                       | **Uniform default M3 size today** (no size differentiation at all) — same new-capability need                                                                                                                  |
| Play/Pause fill                    | `background: var(--accent)`, `color: var(--accent-contrast)`, circular (`:406-407`)                                                                                                                                                           | **Already correct** — `IconButton variant="filled"` already resolves `--accent`/`--accent-contrast` (16c-1/16c-2); just needs the new size, not new colour logic | **Missing** — plain `IconButton`, no fill at all; use Compose's own `FilledIconButton` (real M3 composable, no new component needed) sized `72.dp`, background `MaterialTheme.colorScheme` accent-derived role |
| Scrubber                           | Sonora `Slider` primitive, `platform="mobile"` (`:399`) — **not vendored** (§3.4), no pinned height beyond `SONORA.md`'s general note                                                                                                         | Already exists (`packages/ui` `Slider`), restyle only if it isn't already on Sonora tokens                                                                       | Already exists (M3 `Slider`), restyle colour only                                                                                                                                                              |
| Speed / Sleep readouts             | Two side-by-side pills, `padding:14px 16px`, `border-radius: var(--radius-sm)` = `16px` mobile / `var(--radius-xs)` = `8px` desktop, background `var(--m3-surface-container)` mobile / `var(--surface-card)` desktop (`:214-221`, `:427-431`) | **Missing radius/background pinning** — `player-rate`/`SleepTimerControl` exist but aren't styled as pills today; restyle to match                               | N/A — speed/sleep don't exist on Android at all (§2.2, §7 — out of scope, pre-existing)                                                                                                                        |

**A new capability both platforms need: differentiated transport-button sizing.** Web's
`IconButton` has no size override (fixed `TOUCH_TARGET_MIN = 48px`); Android's plain `IconButton`
likewise defaults to one M3 size. Sonora's mobile sheet wants three distinct sizes in one row
(48/56/72). **Add an optional `size` prop to `packages/ui`'s `IconButton`** (default
`TOUCH_TARGET_MIN`, matching every other optional-prop addition this project has made rather than
forking a second component), and **use Compose's own `FilledIconButton`/`IconButton` with an
explicit `Modifier.size(Nn.dp)`** on Android — no new Android component needed, just an explicit
size at each of the three call sites. **Both platforms currently render every transport icon at
one uniform size — this is new visual hierarchy, not a bug fix**, so treat it as required rather
than optional: it's the single most visible geometry change this triple makes to the busiest
screen in the app.

**Compose has no CSS-cascade fallback — name the placeholder and error painter for every image,
not just the happy path.** `NowPlayingScreen.kt`'s `AsyncImage` (`:115-124`) currently has **no
placeholder or error painter at all** — Coil paints nothing while loading, on failure, or when
`state.artworkUri` is null, so a slow or failed cover load renders an empty `28.dp`-rounded box.
Add a tonal fallback matching `MediaHeader.kt`'s established pattern (fallback icon underneath the
`AsyncImage`, per-kind glyph the same way `MiniPlayer.tsx`'s `COVER_FALLBACK_ICON` map already
does on web) — this is a real gap, not a hypothetical one, and it's on the screen a user looks at
most.

### 3.4 Geometry — queue rows

| Token                  | Value                                                                                                                  | Web (`-W`)                                                                                                                                                                                                                                                                                                      | Android (`-A`)                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Row padding/gap        | `gap:12px`, `padding:8px` (`:853`, `:430`)                                                                             | **Not currently pinned** — `ListItem`'s own existing padding; leave as-is unless visibly wrong                                                                                                                                                                                                                  | Same — `ListItem`'s own existing padding                                                   |
| Row radius             | `var(--radius-xs)` = `8px` (desktop panel, `:853`) / `var(--radius-sm)` = `16px` (mobile, `:854`)                      | **Missing** — no radius on the current-row highlight (there is no highlight at all today, see next)                                                                                                                                                                                                             | **Missing** — same                                                                         |
| Current-row background | `var(--surface-card)` (desktop) / `var(--m3-surface-container)` (mobile), non-current rows: `transparent` (`:853-854`) | **Missing entirely** — `ListItem selected` resolves whatever `ListItem` itself defines today (still `--m3-*`, per `HANDOVER.md`'s remaining-consumers list); this wave does **not** migrate `ListItem` itself (out of scope, §7) — apply the background at the call site if `ListItem` doesn't already give one | **Missing entirely** — no background at all currently, only the trailing text label (§2.3) |
| Row art thumbnail      | `40px` (desktop) / `44px` (mobile) square, `border-radius:6px`/`8px` (`:850,867`)                                      | **Out of scope** — see §7, the underlying per-entry artwork id doesn't exist for music queue entries today                                                                                                                                                                                                      | **Out of scope** — same reasoning                                                          |

### 3.5 Geometry — lyrics, the three-state line treatment

**Sonora specifies three visual states for a lyric line, keyed to position relative to the active
line — not the two states either platform has today** (`:856-859`):

| State                                | Sonora value                                            | Web today                                        | Android today                             |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| Active line                          | `var(--accent-ink)`, weight `700`, `--text-lg` (`16px`) | `--m3-on-surface`, weight 600                    | `colorScheme.primary`, `titleLarge`, bold |
| Lines already passed (before active) | `var(--surface-fg-muted)`, weight `500`                 | Same class as "not yet reached" — no distinction | Same as inactive — no distinction         |
| Lines not yet reached (after active) | `var(--surface-fg)`, weight `500`                       | Same class as "already passed" — no distinction  | Same as inactive — no distinction         |

**This is new work on both platforms, not a colour-token swap.** Today each platform has exactly
one active/inactive boolean; Sonora's three-way split needs each line's index compared against
`activeIndex`/`activeLineIndex` (`index < active`, `index === active`, `index > active`), which
both platforms' existing pure functions already return enough information to compute (`lyrics.ts`'s
`activeLyric`/`activeLineIndex` return the active index; nothing needs to change in those files,
only the render side). **Unsynced lyrics keep the existing behaviour** (all lines rendered in the
"not yet reached" role, none ever marked active/passed) — matches the existing `synced` gate on
both platforms, unchanged.

**Only web renders lyric lines as list items with `key`; Android renders plain `Text` in a
`LazyColumn`.** No accessibility difference follows from this — see §11.

### 3.6 What `SONORA.md` doesn't cover — say so, don't invent

- **The mini player's exact padding, hover/press states, and desktop-vs-mobile layout split** —
  `MiniPlayer`'s own source was never vendored (§3.2). Use this app's existing conventions.
- **The queue tab strip's own visual treatment** (`panelTab()`'s underlying styles, `:213` region)
  — moot, since §3.1 rules out building the tab strip at all.
- **A literal "Playing from X" context string's exact composition rule beyond the mock's own
  literal `'Playing from ' + track.album`** (`:848`) — §6 defines this app's own version.

---

## 4. What the BFF serves vs. what each client uses

**No BFF change is needed for anything in this spec.** Every piece of data this document adds to
the UI is already fetched by one platform or the other and simply not yet rendered, or is derived
purely client-side from state already in hand:

- The mini player's missing artist/artwork on Android: `PlayerUiState.Playing.artist`/
  `.artworkUri` already exist on the state object (`PlayerViewModel.kt:108-109`) — `MiniPlayerBar`
  just never reads them.
- The Now Playing context line ("Playing from X"): derivable client-side from data
  `playerDisplayMeta`/`resolveSubtitle` already resolve (§6).
- The chapter indicator on Android's Now Playing screen: `ChapterList.tsx`'s web equivalent
  already exists; Android's chapter data is already fetched by `BookDetailViewModel` for the
  detail screen — reachable from `PlayerViewModel`'s own state the same way `musicItemId`/
  `audiobookItemId` already are (§6 names the exact mechanism).
- Everything else is styling.

**If a wave finds itself wanting a new BFF field or route, that's a sign this document missed
something — come back to it rather than adding one unilaterally**, matching every prior triple's
own rule.

---

## 5. Fallback contract

| Field                                          | Rule                                                                                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cover art (mini player, Now Playing)           | Tonal placeholder, per-kind icon — matches §3.3's "name the fallback painter" instruction and the existing `COVER_FALLBACK_ICON` convention (`MiniPlayer.tsx:19-23`); reuse the exact map, don't invent a second one |
| Artist/subtitle line                           | Omit entirely if absent — matches today's behaviour on both platforms already (`secondary ? ... : null`, `resolveSubtitle` returning `null`)                                                                         |
| Context line ("Playing from X")                | Omit entirely if there's nothing to name — a standalone track/episode with no album/show context has nothing to compose (§6 defines exactly when this applies per medium)                                            |
| Chapter indicator (Android)                    | Omit entirely (render nothing) when the loaded item has no chapters, or when the current position resolves to none — matches web's `chapter?.title ?? ''` degrading to an empty string                               |
| Duration/remaining time                        | Web: `formatRemaining` always shows `"-0:00"` for an unknown/zero duration. **Android: `"--:--"` for the same case.** This is a real pre-existing divergence — §7 rules it out of scope, keep both as they are       |
| Shuffle/repeat/lyrics on Now Playing (Android) | Once added (§6), gate identically to `MiniPlayerBar`'s existing `state.isMusic` check — omit all three when not playing music, exactly matching the existing mini-player gate                                        |
| Queue, empty                                   | Existing per-content-type messages on both platforms, unchanged (§2.3)                                                                                                                                               |
| Lyrics, no synced/plain lyrics                 | Existing messages on both platforms, unchanged (§2.4)                                                                                                                                                                |

---

## 6. Behaviour contract — both platforms must satisfy this

**Precondition, unchanged:** the mini player renders whenever something is loaded
(`currentItem`/`PlayerUiState.Playing`); Now Playing is reachable only from the mini player's tap
target; the queue and lyrics gate on content type/media kind exactly as today (§2).

### 6.1 Mini player gains art, subtitle and a progress indicator on Android

**Android's `MiniPlayerBar` currently shows title only — no art, no artist, no progress (§2.1).**
Add all three, reusing state the ViewModel already exposes (`state.artworkUri`, `resolveSubtitle`,
`playbackProgressFlow()` — the same flow `NowPlayingScreen` already collects, §3.2). **Do not
build a second progress source** — `playbackProgressFlow()`/`sliderFraction` already exist and are
the one mechanism this app has for "what fraction through is this"; reuse them here rather than a
bar-local computation.

**Web's mini player art size is wrong and the fix is a one-line correction, not new work.**
`MiniPlayer.tsx:73`'s `size={48}` should read `size={44}` (or, better, read
`--miniplayer-album-size` directly if `CoverImage`'s `size` prop can take a CSS value — the
`-W` agent's call) to give `--miniplayer-album-size` its first production reader.

### 6.2 Now Playing regains shuffle, repeat and lyrics on Android

**The core fix.** Collapsing to the mini player currently loses nothing (shuffle/repeat/lyrics are
all there); expanding to the full Now Playing screen currently loses all three. Add:

- **Shuffle and repeat**, identical gating and mechanism to `MiniPlayerBar`'s existing controls
  (`state.isMusic`, `playerViewModel.toggleShuffle`/`cycleRepeatMode`) — **do not build a second
  toggle mechanism**, thread the same callbacks `AuralisShell.kt` already passes to
  `MiniPlayerBar` (`:151-155`) into `NowPlayingScreen` as well.
- **A lyrics affordance** — an `IconButton` (`Icons.Filled.Subtitles`, matching `MiniPlayerBar`'s
  existing icon choice for visual consistency) navigating to the same `Routes.LYRICS` destination
  `MiniPlayerBar`'s own button already reaches. **Do not build a second lyrics screen or inline
  the lyrics content into `NowPlayingScreen`** — §3.1 already rules out restructuring into
  Sonora's inline-sheet shape; this is the same "add a button, keep the existing route" move
  `ALBUM_DETAIL.md` made for the artist link.

All three use `state.isMusic` as their gate, exactly matching `MiniPlayerBar`'s existing rule —
consistency between the two surfaces (they show the same three controls, gated the same way) is
the actual fix; where they physically sit is secondary.

### 6.3 Now Playing gains a chapter/context indicator on both platforms

**Web already shows the current chapter** (`now-playing-chapter`, §2.2) — keep it unchanged
(restyle only). **Android shows nothing** — add an equivalent line for the audiobook case,
sourced from `PlayerViewModel.audiobookItemId` plus the chapter list already fetched for the
detail screen (the exact mechanism is the `-A` agent's implementation call; the _requirement_ is
parity with what web already shows, not a new BFF fetch — §4).

**Both platforms gain the "Playing from X" context line for music, new on both** (§3.3), composed
as: `"Playing from {album title}"`, literal, matching Sonora's own `'Playing from ' + track.album`
(`:848`). **Fallback:** omit entirely when there's no album context (a single track with no
containing album/playlist — checked against whether this ever actually happens in practice is the
implementing agent's call; if it can't happen today, the omission branch still costs nothing to
write and guards a future queue source that might not have one).

This is **three different "extra context under the title" needs, one per medium** — audiobook
(chapter), podcast (nothing new; the existing `secondary` line already names the show), music
(album context). Do not build one generic mechanism that tries to unify audiobook chapters with
music album context; they're different pieces of state on different platforms already (§2.2's
`resolveSubtitle`/`playerDisplayMeta` machinery is the existing precedent for "per-medium display
logic lives in one small pure function, not a shared one-size-fits-all string").

### 6.4 Queue row highlight

**Add the current-row background** (§3.4) on both platforms — `--surface-card`/`--m3-surface-container`
depending on breakpoint (web) or the single mobile value (Android), applied alongside the existing
`selected`/"Now playing" mechanisms, not replacing them. This is additive visual reinforcement of
a state both platforms already compute correctly (§2.3) — no new state, no new prop.

### 6.5 Lyrics — the three-state line treatment

Implement §3.5's three-way split on both platforms. **The pure "which index is active" logic does
not change** (`activeLyric`/`activeLineIndex` stay as they are) — only the render-side mapping
from `(lineIndex, activeIndex)` to one of three style roles is new. Unsynced lyrics keep rendering
every line in the "not yet reached" role (§3.5) — this is the existing `synced` gate, unchanged.

### 6.6 Previous/Next track — an existing Android-only control, kept as-is

**Not adding this to web.** Android's `NowPlayingScreen` already has Previous/Next buttons
(`skipToNext`/`skipToPrevious`, §2.2); web's `NowPlaying.tsx` has none. §7 rules this idiom, not a
gap to close on web — see that section for the reasoning (Media3 gives Android a real queue to
step through for free; web would need new plumbing).

---

## 7. Explicitly out of scope

- **Sonora's tabbed desktop panel.** §3.1's ruling — keep the existing stacked-scroll structure on
  both platforms.
- **A seekable/interactive mini player progress bar, and prev/next buttons on the mini player.**
  Sonora's desktop `MiniPlayer` prop table includes `onSeek`/`onPrev`/`onNext`/`queueOpen`/
  `onToggleQueue` (§2.1); neither platform's mini player has any of these today, and both already
  offer full seek/skip one tap away (expand to Now Playing). Adding interactive transport to the
  docked bar is a real interaction-model change, not a restyle, and it's the same shape of
  decision §3.1 already declined for the panel — declined here for the same reasons. If this
  becomes wanted later, it's its own wave with its own spec.
- **Queue row artwork thumbnails.** Sonora's mock shows one (§3.4); podcast/audiobook queue
  entries already carry an `itemId` an artwork URL could be built from
  (`PodcastQueueEntry.itemId`, `AudiobookQueueEntry.itemId`), but **`QueueTrack` (music) carries
  no artwork reference of any kind** (`musicQueue.ts:28-38`, read in full — `id`, `title`,
  `durationSeconds`, `artist`, nothing else). Adding art consistently across all three content
  types needs new plumbing for music specifically; adding it only for two of three would be a
  worse inconsistency than having none. Matches this project's own rule: a wave that finds itself
  wanting a new field should come back to the spec rather than adding one unilaterally (§4).
- **Aligning skip-interval behaviour.** Web is configurable (Settings, default 30s/30s
  symmetric); Android is fixed at 10s back/30s forward, with no setting at all. Real, pre-existing,
  **not this triple's job** — it's a Settings/behaviour question, not a visual one. §8 names it.
- **Aligning the "unknown duration" remaining-time label** (`"-0:00"` web vs. `"--:--"` Android,
  §5). Small, pre-existing, orthogonal to the redesign.
- **Unifying the queue screen's per-content-type header wording** (web names the type, Android
  says `"Queue"` always, §2.3). Cosmetic, pre-existing, not part of the visual language this wave
  is applying.
- **`LinearProgress`'s `wavy` prop** — already dropped by user decision (`docs/USER_DECISIONS.md`),
  restated here so nobody re-adds it while restyling the mini player's progress bar.
- **Chapters, bookmarks, playback speed, and the sleep timer on Android.** All four are
  Android-absent today (§2.2) and none appear in Sonora's own player mock as interactive controls
  either (§2.2's note on the mock's non-interactive Speed/Sleep readouts). Out of scope; a
  candidate for a future wave if wanted, not silently added here.
- **Building the Sonora `MiniPlayer`/`TrackRow` primitives from scratch as reusable `packages/ui`
  components.** Their real source was never vendored (§3.2); this wave restyles the app's existing
  bespoke mini-player/queue-row markup in place, the same way every 16e triple so far has restyled
  bespoke screen markup without first extracting a design-system primitive that doesn't exist yet.

---

## 8. Deliberately unequal

- **The Now Playing surface's own shape — the headline divergence of this whole document.**
  Docked side panel (`expanded`) / sheet (below it) on web; an always-full-screen overlay on
  Android. Ruled idiom in §3.1, for the reasons given there. If the `-P` review finds either
  implementation drifted from _this_ document's per-shape geometry tables while keeping the
  correct overall shape, that's a normal implementation gap, not a re-opening of this ruling.
- **Queue and lyrics as inline stacked content (web) vs. separate routes (Android).** Pre-existing
  architecture on both platforms, kept (§3.1, §6.2). Not drift — Android's navigation model
  already works this way for other surfaces (`BOOK_DETAIL.md`'s chapters are inline on the detail
  screen on both platforms, by contrast, which is why that one _is_ comparable and this one isn't:
  queue/lyrics are reached from a different starting surface — the mini player/Now Playing, not a
  detail page — on both platforms already).
- **Skip-interval configurability and amount** (§7) — web 30s/30s configurable, Android fixed
  10s/30s. Pre-existing, out of scope, named so the `-P` review doesn't read it as new drift this
  triple introduced.
- **Previous/Next track controls exist on Android's Now Playing screen and not on web's** (§6.6).
  Kept as Android-only: Media3 gives Android a real queue `skipToNext`/`skipToPrevious` can step
  through natively; web's queue is a client-side construct (`musicQueueStore`) with no equivalent
  "the platform already tracks this for me" mechanism, and adding one is real new work belonging
  to a future wave, not a restyle.
- **The "unknown duration" remaining-time label** (`"-0:00"` vs `"--:--"`, §5, §7) — small,
  pre-existing, named so it isn't mistaken for something this wave should have caught.
- **The queue's currently-playing row indicator stays platform-specific**, reusing the exact
  pairing `ALBUM_DETAIL.md` §8 already established and named "deliberately unequal" there:
  `ListItem`'s `selected`/`aria-current` on web (no visible text), a literal `"Now playing"`
  trailing label on Android (visible text, no `aria-current` equivalent needed since Compose
  semantics work differently — see §11). Both satisfy the same requirement; reusing an
  already-reviewed idiom rather than inventing a third treatment.

---

## 9. Web: what changes

1. **Mini player** (§6.1) — fix the art size (`48` → `44`/token), give `--miniplayer-album-size`
   its first reader.
2. **Now Playing surface geometry** (§3.3) — art radius (`--radius-md` panel / `--radius-lg`
   sheet), title on `--font-display` weight 900 at the two pinned sizes, subtitle/context line
   sizing and colour roles, transport button size differentiation (new `IconButton` `size` prop,
   §3.3), speed/sleep pill styling.
3. **The context line** (§6.3) — new, music only, `"Playing from {album}"`.
4. **Queue row highlight background** (§6.4).
5. **Lyrics three-state colouring** (§6.5) — `LyricsView.tsx`'s render logic changes; `lyrics.ts`'s
   pure functions do not.
6. **`IconButton`'s new `size` prop** (§3.3) — shared infrastructure; existing call sites that
   don't pass it keep today's `TOUCH_TARGET_MIN` behaviour unchanged, matching how every prior
   optional-prop addition in this project (`onSubtitleClick`, etc.) has been additive-only.

Everything else in `NowPlaying.tsx`/`MiniPlayer.tsx`/`QueueView.tsx`/`LyricsView.tsx` — the
sheet-vs-panel-vs-embedded logic, `showQueueControls` gating, `buildQueueEntries`, the whole
`playerDisplayMeta`/`resolveQueuePosition` pipeline — is unchanged; this is a restyle plus the
four additions above, not a rewrite.

---

## 10. Android: what changes

1. **`MiniPlayerBar` gains art, subtitle, and a progress indicator** (§6.1) — reusing
   `state.artworkUri`, `resolveSubtitle`, and `playbackProgressFlow()`, all of which already
   exist on `PlayerViewModel`/`PlayerUiState.Playing`.
2. **`NowPlayingScreen` gains shuffle, repeat, and a lyrics `IconButton`** (§6.2) — same callbacks
   `AuralisShell.kt` already threads into `MiniPlayerBar`, same `state.isMusic` gate, same
   `Routes.LYRICS` destination the mini player's own button already reaches.
3. **`NowPlayingScreen` gains a chapter/context indicator** (§6.3) — audiobook chapter title
   (parity with web's existing `now-playing-chapter`), music `"Playing from {album}"` context.
4. **`NowPlayingScreen`'s cover art gets a placeholder/error painter** (§3.3) — currently absent;
   Coil paints nothing on load/failure/null model without one.
5. **`NowPlayingScreen`'s title gets `Modifier.semantics { heading() }`** (§11) — currently not
   marked as a heading at all, unlike web's real `<h1>`.
6. **Play/pause becomes a filled, accent-coloured, `72.dp` circular control** on `NowPlayingScreen`
   (§3.3) — Compose's own `FilledIconButton`, no new component.
7. **Transport row icon sizes are differentiated** (§3.3) — `48.dp`/`56.dp`/`72.dp`, explicit
   `Modifier.size(...)` per control, not a new shared component.
8. **`QueueScreen` and `LyricsScreen` rows/lines get their geometry/colour restyle** (§3.4, §3.5)
   — current-row background on `QueueScreen`, three-state colouring in `LyricsScreen`'s
   `LyricsList`.

Everything else — the `Routes.QUEUE`/`Routes.LYRICS` navigation structure, `resolveAdvanceAction`,
`QueueRowUi` construction, the drag/tick arbitration on the seek `Slider`, Media3's own queue
mechanics — is unchanged.

---

## 11. Accessibility requirements

- **Now Playing's title must be marked as a heading on both platforms.** Web already has a real
  `<h1>` (§2.2); Android's `NowPlayingScreen` title has no `Modifier.semantics { heading() }` at
  all — add it (§10, item 5). This is a real, closable gap, not a restyle nicety.
- **The scrubber's accessible value must announce elapsed and total time on both platforms.**
  Web already does (`valueText={\`${formatDuration(currentTime)} of ${formatDuration(duration)}\`}`,
§2.2). **Android's `Slider`has no equivalent announced value today** — add one via`Modifier.semantics { stateDescription = ... }`or the`Slider`'s own value-description
mechanism, composed identically to web's format for the same reason `ALBUM_DETAIL.md`/
`PODCAST_DETAIL.md`pinned literal example strings:`"{elapsed} of {total}"`.
- **The new lyrics three-state colouring must not be colour-only.** Sonora's own values already
  pair the active line with a weight change (`700` vs `500`, §3.5) — keep that pairing on both
  platforms (Android already does this for its existing two-state treatment, §2.4; carry it
  forward into the three-state version). A colour-only distinction between "passed" and "not yet
  reached" is fine — neither is the _active_ state a screen-reader or low-vision user needs to
  find quickly, and no live region announces line changes either way (§2.4, unchanged).
- **Shuffle and repeat on `NowPlayingScreen` (Android, new) must use the exact same semantics as
  `MiniPlayerBar`'s existing controls** — `Role.Switch` + `stateDescription` for shuffle, a
  fully-worded `contentDescription` for repeat (§6.2). Do not invent a second announcement pattern
  for the same controls appearing on a second screen.
- **The mini player's new Android progress indicator is decorative, not interactive** — no
  `contentDescription` needed beyond what the row's existing merged semantics (if any) already
  carry; this mirrors web's `LinearProgress aria-label="Playback progress"`, which Android should
  match with an equivalent non-interactive label if `LinearProgressIndicator` doesn't already
  supply a sensible default.
- **The queue's currently-playing indicator stays platform-specific, and both already satisfy the
  requirement** (§8) — no change needed to `aria-current` on web or the trailing label on Android;
  only the new background highlight (§6.4) is additive.

---

## 12. Two constraints both implementing waves inherit

- **Only one `-W` wave can run Playwright at a time on this machine** — `playwright.config.ts`'s
  hardcoded port 4310. Check before dispatching `16e-nowplaying-W` alongside anything else that
  needs a browser.
- **Nothing on this machine compiles Kotlin.** Budget two-to-three red Android CI rounds. The two
  compiler-free pre-checks (`/*`/`*/` balance per changed `.kt` file, no `.` in a backtick test
  name) cost nothing and measurably reduce them.

---
id: front
nav: Design & frontend
part: How it's built
---
## Design system and frontend

::: lede
Everything in the app starts as a Sonora component, and every page starts on the canvas.
:::

### How you work on the design

- **Two things to look at, one place it lives.** You work with two artifacts: the [Sonora Design System](https://claude.ai/artifact/CUW4CN7KpxgvjeWnbhTQBB) (the building blocks) and the [Auralis canvas](https://claude.ai/artifact/S3ob9VNh7LjZHBmEmE9ULq) (the app's pages and navigation). Both are published from the one Auralis repo: `design/sonora` and `design/app`, next to `server`, `web` and `android`. Sonora's repo on the ThinkPad moves in with its history.
- **Asking for a change:** comment on either artifact, or ask in chat. Claude changes the repo, regenerates, and republishes the artifact. If you edit an artifact directly, those edits are pulled into the repo before anything else changes there.
- **How a design change reaches the apps.** Design and apps are in the same repo, so one commit carries both:
  - colours, spacing and fonts change on both platforms automatically;
  - a component's look changes on web automatically, since web uses Sonora's components directly;
  - a new or changed component option fails the Android build until it's implemented there, so the platforms can't drift;
  - a new or changed page, or navigation, regenerates both apps' routes and page layouts;
  - screenshots of both apps are compared against the design, and differences are shown to you before they ship.

### Where Sonora ends and the canvas begins

::: grid g2
::: card
#### Sonora: the design system

- Tokens, basic pieces, components and page layouts, each with a `.d.ts`, a card, and dark and light previews. No Auralis data.
- Grows because the app needs something, but anything that lands here is generic: a `FeatureCard`, not "the podcast digest card".
:::

::: card
#### The canvas: the app

- The **navigation map** (every destination, route, parameter and back behaviour, per breakpoint) and every **page**, composed only of Sonora components, with real copy and states.
- If a page needs something Sonora lacks, the component is added to Sonora first. The canvas never styles anything itself.
:::
:::

**Where the screens come from.** Sonora is the most complete design: its desktop and mobile UI kits, its showcase cards and the 43 Spotify reference screens. The "Auralis redesign kickoff" project, which old Auralis vendored (tag `legacy`, `docs/design/sonora`), adds only its screen list (artist, author, shelf, onboarding); its 9 components are all in Sonora now. The screen map is the union, rebuilt on the canvas from current Sonora components; where they disagree, Sonora's wins. The UI kits move out of Sonora onto the canvas, since screens don't belong in the design system. The Claude Design projects stay as read-only references.

### Sonora, pruned and ordered

Sonora has 80 components today, filed by kind (core, forms, layout, media, navigation). 18 of them were added in the Spotify affordance pass (checked in its git history): Button, BrowseCard, ExpanderRow, FollowButton, Rating, SortFilterBar, StatusBanner, BackToTop, DownloadButton, EpisodeRow, FeatureCard, ItemActionBar, ExpandableText, AboutCard, MediaHeader, OutputDeviceButton, SpeedControl and TransportBar. Most of the rest came from the original Claude Design project.

- **One hierarchy:** tokens → basic pieces (buttons, chips, inputs, cover art) → components (cards, rows, transport, headers) → page layouts (shell, backdrop, shelf, detail and collection pages). The artifact is organised the same way. Pages live only on the canvas.
- **Pruned against the screens.** Once the canvas has the full screen map, in the foundations milestone, each component lists the pages that use it. Anything no page uses is removed, whichever pass it came from. Candidates to look at first: OutputDeviceButton (only needed for "Play on…", which comes late), FollowButton, Rating, BrowseCard and BackToTop.
- **Input hands its handler the text.** `Input`'s `onChange` gets the new string, as every other form component does, so `FieldRow`'s `(next: string)` handler no longer receives a DOM event.

### From design to both apps

::: grid g2
::: card
#### From Sonora

- **About 80 components with typed props** (`export/component-api.md`, generated from each `.d.ts`): shell (the backdrop's BackdropShell, BackLayer, FrontLayer and FrontLayerHeader, plus NavRail and BottomNav), media (MediaCard, FeatureCard, EpisodeRow, ResultRow, MediaHeader, DetailPage, CollectionPage), player (NowPlaying, PlayerSheet, PlayerPanel, TransportBar with a _spoken_ variant, SeekBar, SpeedControl, QueuePage with edit mode, Lyrics with three sync modes, OutputDeviceButton), status (StatusBanner, DownloadButton, ProgressRing, Badge).
- **A token exporter**: `export/web/sonora-tokens.css`, `sonora-theme.css` and `export/android/SonoraTokens.kt`, all generated. Motion, scrim, tone and layout families included.
- **43 Spotify reference screens**, each mapped to the components it motivated. They stay as reference pictures, not components.
:::

::: card
#### What the rebuild does with it

- **Web uses Sonora's components directly, not ports.** They're real React with typed props. `pnpm gen` turns Sonora's global-namespace lookups (`NS().CoverArt`) into normal imports and writes them to `web/src/generated/ui`, the app's UI package. The `.d.ts` files are the props, unchanged.
- **Android**: `SonoraTokens.kt` as the theme, plus one Compose component per Sonora component with the same name. Its props class is **generated from the same `.d.ts`**, so a prop added in Sonora appears in Android's props at once, and a required one breaks the Android build until it is passed. Layout bodies are hand-written, as `export/README.md` spells out.
- Sonora's `QUESTIONS.md` (Now Playing shape, speed and sleep sheets, queue edit scope) is answered on the Auralis canvas before the player screens are built.
:::
:::

Your rule: nothing frontend reaches code before it is in the published design, in the order Sonora artifact, then the Auralis canvas artifact, then code. Pages and navigation are added to the design first, then ported to the apps mechanically:

1. **Structure comes before pictures.** Every screen first gets a plain-text structure in `nav.json`: its purpose, its sections in order (unsettled ones marked provisional), its empty state and the screens it links to. The canvas shows it as a text artboard beside a navigation flowchart, both generated, so you settle the hierarchy by commenting before any mockup distracts you with detail. A page is drawn only once it has a structure.
2. **Navigation is data.** The canvas holds `nav.json`: destinations, routes and parameters, which destination each page lights up, back behaviour, and the layout at each breakpoint (bottom bar, rail, side panel). Code generation turns it into the web router and the Android Navigation-Compose graph, so both apps get **the same flows from the same file**.
3. **Pages are a restricted format.** Each page is JSX that may only use Sonora components, literal props, and bindings to its screen endpoint's generated types (`{feed.shelves}`). No custom styling, no logic. A parser turns it into a small page tree. From that tree the web page is generated as React and the Android page as Compose, both calling the same component names.
4. **Generated code is off-limits.** Routes and page layouts are generated files, never edited by hand. Hand-written code only supplies data (the screen's API call, view-model state and actions) behind the page's typed slots.
5. **CI enforces it**:
   - the app's routes must equal `nav.json` exactly;
   - every page must match its generated layout;
   - web and Android must build the same route set;
   - each page's screenshot on both platforms is compared against the design's render of that page;
   - the "Published artifacts are current" job, and the Stop hook, fail while `design/sonora` or `design/app` differs from its recorded publish, has no record, or the canvas installs a Sonora other than the published one;
   - the `auralis/no-hand-ui` lint refuses HTML elements, `style` and `className` in `web/src` outside `generated/`, and a test refuses `@Composable` functions outside Android's `generated` and `ui/sonora` packages, each with a documented allowlist.

   Adding a screen in code alone fails the build.
6. **The frontend build starts with navigation.** The first frontend deliverable is both apps navigating the full generated map with placeholder data, compared against the design and each other, before any screen gets real content.

- **Mantine** is optional: used only inside a component that needs a behaviour primitive (menus, focus traps), never as the visual layer.
- **The app frame** is Sonora's backdrop shell (`BackdropShell`, `BackLayer`, `FrontLayer`, `FrontLayerHeader`, per `SPEC-backdrop.md`), a real Material 2 backdrop as the latest Sonora mockups draw it, which also settles the old scroll bug.

### Shell and navigation

Five buttons: Browse, Music, Books, Podcasts, Search. Bottom bar under 600&nbsp;px with Search rightmost, icon rail from 600 and labelled rail from 1024 with Search topmost. Now Playing, with Queue and Lyrics perhaps as its tabs, is a panel next to the content from 1240; narrower, the mini-player opens it as a full-screen sheet over the bottom bar. Settings sits at the foot of the rail, or behind your avatar at the start of the phone's top bar, never inside a filter row. Chrome stays fixed and only the content scrolls; that was the scroll bug you reported. The mini-player is always present once something is loaded.

- **Back.** ✕ (or up) returns to whatever opened a screen, and each destination keeps its own stack: leave Music on an album, come back, and ✕ goes to the artist you opened it from. Android's back does what ✕ does; the browser's back goes to the previous view, wherever that was. A sheet closes to the page under it.
- **Search, global and local.** The Search destination searches everything, its filters in the backdrop's back layer. Each library home, shelf, album, playlist, show and book has a bar that appears as you scroll and searches only that page, or that library and its requests.

### Rules from your notes that the components must follow

- **One accent, one play colour:** violet everywhere, rose (`--play`) only for Now Playing, the mini-player, transport, seek and progress fills, and Browse's media filter.
- **Shapes never change meaning:** artists, authors and hosts are circles; all content is rounded squares. Don't copy Spotify's podcast-versus-album split.
- **Now Playing matches the content:** podcasts and books get speed and skip (Sonora's `TransportBar` _spoken_ variant); music gets shuffle and repeat, with music speed buried elsewhere, not removed.
- **Lyrics:** a sync toggle always in the top corner. With sync off, every line is at full opacity and a dot marks the current line; the dot can be switched off from the three-dot menu. Sonora already specifies this.

### Screens and the one call behind each

| Screen | Endpoint | What it returns | Design |
|---|---|---|---|
| Browse | `GET /feed` | kind chips, quick picks (progress, unplayed), shelves (eyebrow, subject, subject art, mixed items, availability), feature cards with preview | <span class="pill t-lib">Sonora</span> S05–S30 |
| Music / Books / Podcasts homes | `GET /library/{music\|books\|podcasts}` | library list with sort and filter, list or grid, pins and downloaded markers | <span class="pill t-lib">Sonora</span> S31 · LibraryShell |
| Search | `GET /search/suggest`, `GET /search` | suggestions; library results + outside results, status per row, "more releases" folding | <span class="pill t-lib">Sonora</span> S03–S04, S32 |
| Book · Show · Episode · Album | `GET /items/{ref}` | MediaHeader data (actions, progress, rating), episodes with sort, chapters or tracks, about text, related, a book's other narrations | <span class="pill t-lib">Sonora</span> S01–S02, S35 |
| Artist · Author · Series | `GET /people/{ref}`, `GET /series/{ref}` | owned works grouped; unowned works greyed out (on by default) | <span class="pill t-req">mock only</span> |
| Shelf ("See all") | `GET /feed/shelves/{id}` | paged items | <span class="pill t-lib">Sonora</span> UI kit collection screen |
| Now Playing · mini-player · queue · lyrics | `POST /play`, `GET /queues`, `GET /lyrics/{ref}` | plan (with transport variant and direct or transcoded quality), per-type queues, synced lyrics, about cards | <span class="pill t-lib">Sonora</span> S33–S43 |
| Requests | `GET /requests` | status, %, source, size, retry | <span class="pill t-req">mock only</span> |
| Downloads (Android) | local, plus `GET /items/{ref}` | what's on the device, size, remove | <span class="pill t-req">parts</span> DownloadButton, no screen |
| Settings · onboarding | `GET/PUT /settings`, `/setup`, `/auth` | theme, autoplay rules, services, providers, requests | <span class="pill t-lib">Sonora</span> UI kit settings screen |

::: callout warn
**Still to design on the Auralis canvas, before their milestone:** artist, author and series pages (with the greyed unowned catalogue), the Requests view, the Downloads screen, playlists, the music _Add to library_ menu item and album request, the YouTube channel settings (SponsorBlock, Shorts) and the YouTube account connection in Settings, and loading and empty states per screen. Everything else has a Sonora component and a reference screen. Nobody invents UI in code.
:::

### How parity stays true

- Both clients consume the same generated models and the same screen endpoints, so there's no logic to port by hand.
- Each screen has a shared set of recorded API responses (one per state: loading, empty, full, error). Web (Playwright) and Android (Paparazzi) render the same set and produce screenshots. Each page's render sits beside its Sonora UI kit render in a committed comparison under `design/app/compare`, with the differences listed, and a test fails when a page changes without a fresh comparison. This is the visual check the old project never had.

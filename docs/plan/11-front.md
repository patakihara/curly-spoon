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

- **Two artifacts, one repo.** The [Sonora Design System](https://claude.ai/artifact/CUW4CN7KpxgvjeWnbhTQBB) (the building blocks) and the [Auralis canvas](https://claude.ai/artifact/S3ob9VNh7LjZHBmEmE9ULq) (the app's pages and navigation), both published from `design/sonora` and `design/app` in the Auralis repo, beside `server`, `web` and `android`. Sonora's laptop repo moves in with its history.
- **Asking for a change:** comment on either artifact, or ask in chat. Claude changes the repo, regenerates, and republishes the artifact. Edits made directly in an artifact are pulled into the repo before anything else changes there.
- **How a design change reaches the apps.** One commit carries design and apps:
  - colours, spacing and fonts change on both platforms automatically;
  - a component's look changes on web automatically, since web uses Sonora's components directly;
  - a new or changed component option fails the Android build until it's implemented there, so the platforms can't drift;
  - a new or changed page, or navigation, regenerates both apps' routes and page layouts;
  - screenshots of both apps are compared against the design, and you see differences before they ship.

### Where Sonora ends and the canvas begins

::: grid g2
::: card
#### Sonora: the design system

- Tokens, basic pieces, components and page layouts, each with a `.d.ts`, a card, and dark and light previews. No Auralis data.
- Grows as the app needs, but stays generic: a `FeatureCard`, not "the podcast digest card".
:::

::: card
#### The canvas: the app

- The **navigation map** (every destination, route, parameter and back behaviour, per breakpoint) and every **page**, composed only of Sonora components, with real copy and states.
- If a page needs something Sonora lacks, the component is added to Sonora first. The canvas never styles anything itself.
:::
:::

**Where the screens come from.** Sonora's UI kit renders, showcase cards and 43 Spotify reference screens, plus the screen list (artist, author, shelf, onboarding) of the "Auralis redesign kickoff" project old Auralis vendored (tag `legacy`, `docs/design/sonora`), whose 9 components are all in Sonora now. The canvas rebuilds their union from current Sonora components; where they disagree, Sonora wins. The UI kits survive only as renders, the canvas comparisons' sources, and the Claude Design projects as read-only references.

### Sonora, pruned and ordered

Sonora has 66 components, filed by level (basic, components, layouts).

- **One hierarchy:** tokens → basic pieces (buttons, chips, inputs, cover art) → components (cards, rows, transport, headers) → page layouts (backdrop shell, sections, shelves, the player's pages). The artifact is organised the same way. Pages live only on the canvas.
- **Pruned against the screens.** Each component lists the canvas pages that draw it, and a test fails on one no page draws. A component a later milestone needs, such as the output device button for "Play on…", arrives with its page.
- **Input hands its handler the text.** `Input`'s `onChange` gets the new string, like every other form component, so `FieldRow`'s `(next: string)` handler gets a string.
- **Controls show Material's states.** Every interactive component has enabled, disabled, hovered, focused (an outer ring) and pressed, a ripple spreading from the press point with no change of shape. One with no action attached is disabled, as is one set `disabled`.

### From design to both apps

::: grid g2
::: card
#### From Sonora

- **66 components with typed props** (`export/component-api.md`, generated from each `.d.ts`): shell (the backdrop's BackdropShell, BackLayer, FrontLayer and FrontLayerHeader, plus NavRail and BottomNav), media (MediaCard, FeatureCard, EpisodeRow, ResultRow, MediaHeader), player (NowPlaying, PlayerSheet, PlayerPanel, TransportBar with a _spoken_ variant, SeekBar, SpeedControl, QueuePage with edit mode, Lyrics with three sync modes), status (StatusBanner, DownloadButton, ProgressRing, Badge).
- **A token exporter**: `export/web/sonora-tokens.css`, `sonora-theme.css` and `export/android/SonoraTokens.kt`, all generated. Motion, scrim, tone and layout families included.
- **43 Spotify reference screens**, each mapped to the components it motivated, kept as reference pictures, not components.
:::

::: card
#### What the rebuild does with it

- **Web uses Sonora's components directly, not ports.** They're real React with typed props. `pnpm gen` turns Sonora's global-namespace lookups (`NS().CoverArt`) into normal imports and writes them to `web/src/generated/ui`, the app's UI package. The `.d.ts` files are the props, unchanged.
- **Android**: `SonoraTokens.kt` as the theme, plus one Compose component per Sonora component with the same name. Its props class is **generated from the same `.d.ts`**, so a prop added in Sonora appears in Android's props at once, and a required one breaks the Android build until it is passed. Layout bodies are hand-written, as `export/README.md` spells out.
- Sonora's Now Playing questions (shape, speed and sleep sheets, queue edit scope) are answered by the canvas's player pages.
:::
:::

Your rule: nothing frontend reaches code before it is in the published design, Sonora artifact, then Auralis canvas artifact, then code, ported to the apps mechanically:

1. **Structure comes before pictures.** Every screen first gets a plain-text structure in `nav.json`: its purpose, its sections in order (unsettled ones marked provisional), its empty state and the screens it links to. The canvas's start page shows the generated navigation flowchart and list of screens, no mockups, so you settle the hierarchy first. Each screen gets a canvas page: its structure beside its mockups, nothing else loaded. A page is drawn only once it has a structure.
2. **Navigation is data.** The canvas holds `nav.json`: destinations, routes and parameters, which destination each page lights up, back behaviour, and the layout at each breakpoint (bottom bar, rail, side panel). Code generation turns it into the web router and the Android Navigation-Compose graph, so both apps get **the same flows from the same file**.
3. **Pages are a restricted format.** Each page is JSX that may only use Sonora components, literal props, and bindings to its screen endpoint's generated types (`{feed.shelves}`). No custom styling, no logic. A parser turns it into a small page tree. From that tree the web page is generated as React and the Android page as Compose, both calling the same component names.
4. **Generated code is off-limits.** Routes and page layouts are generated files, never edited by hand. Hand-written code only supplies data (the screen's API call, view-model state and actions) behind the page's typed slots.
5. **CI enforces it**:
   - the app's routes must equal `nav.json` exactly;
   - every page must match its generated layout;
   - web and Android must build the same route set;
   - each page's screenshot on both platforms is compared against the design's render of that page;
   - the "Published artifacts are current" job, and the Stop hook, fail while `design/sonora`, `design/app` and its art, or the code building either, differs from its recorded publish, has no record, or the canvas installs a Sonora other than the published one;
   - the `auralis/no-hand-ui` lint refuses HTML elements, `style` and `className` in `web/src` outside `generated/`, and a test refuses `@Composable` functions outside Android's `generated` and `ui/sonora` packages, each with a documented allowlist.

   Adding a screen in code alone fails the build.
6. **The frontend build starts with navigation.** The first frontend deliverable is both apps navigating the full generated map with placeholder data, compared against the design and each other, before any screen gets real content.

- **Mantine** is optional: used only inside a component that needs a behaviour primitive (menus, focus traps), never as the visual layer.
- **The app frame** is Sonora's backdrop shell (`BackdropShell`, `BackLayer`, `FrontLayer`, `FrontLayerHeader`, per `SPEC-backdrop.md`), a real Material 2 backdrop as Sonora Prime, the last mockups before the rebuild, draws it.

### Shell and navigation

Five buttons: Browse, Music, Books, Podcasts, Search. Bottom bar under 600&nbsp;px with Search rightmost, icon rail from 600 and labelled rail from 1024 with Search topmost, a hamburger at its top collapsing it to the icon rail and back. Now Playing, with Queue and Lyrics as its tabs, is a panel next to the content from 1240; narrower, the mini-player opens it as a full-screen sheet over the bottom bar. Settings sits at the foot of the rail, or behind your avatar at the start of the phone's top bar, never inside a filter row. Chrome stays fixed, only content scrolls (the scroll bug you reported). The shell stays mounted between pages, so the rail moves as in Sonora Prime. The mini-player stays once something is loaded. On the phone, a page that is not a destination (a shelf, Requests, an album) shows a top app bar with ✕ and its title, not the backdrop; on desktop it sits in the backdrop of the destination that opened it, that rail item lit.

- **Back.** ✕ (or up) returns to whatever opened a screen, and each destination keeps its own stack: leave Music on an album, come back, and ✕ goes to the artist you opened it from. Android's back acts as ✕; the browser's back goes to the previous view, wherever that was. A sheet closes to the page under it.
- **Search, global and local.** The Search destination searches everything, its filters in the backdrop's back layer. Each library home, shelf, album, playlist, show and book has a bar that appears as you scroll and searches only that page, or that library and its requests.

### Rules from your notes that the components must follow

- **One accent, one play colour:** violet everywhere, rose (`--play`) only for Now Playing, the mini-player, transport, seek and progress fills, and Browse's media filter. Every control on rose has white content, your choice over AA.
- **Theme follows the device:** light or dark from the system, unless Settings picks one. `data-theme` still themes any container, and each canvas page switches its mockups between both.
- **Shapes never change meaning:** artists, authors and hosts are circles; all content is rounded squares. Don't copy Spotify's podcast-versus-album split.
- **Now Playing matches the content:** podcasts and books get speed and skip (Sonora's `TransportBar` _spoken_ variant); music gets shuffle and repeat, with speed tucked away, not removed.
- **Tabs and menus:** a tab row opens on its first tab. On the phone a context menu is a modal bottom sheet over the bottom bar and mini-player; on desktop it hangs from its button.
- **Lyrics:** a sync toggle always in the top corner. Sync off shows every line at full opacity, a dot marking the current line that the three-dot menu can switch off. Sonora specifies this.

### Screens and the one call behind each

| Screen | Endpoint | What it returns | Design |
|---|---|---|---|
| Browse | `GET /feed` | kind chips, quick picks (progress, unplayed), shelves (eyebrow, subject, subject art, mixed items, availability), feature cards with preview | <span class="pill t-lib">Sonora</span> S05–S30 |
| Music / Books / Podcasts homes | `GET /library/{music\|books\|podcasts}` | library list with sort and filter, list or grid, pins and downloaded markers | <span class="pill t-lib">Sonora</span> S31 · UI kit library screens |
| Search | `GET /search/suggest`, `GET /search` | suggestions; one ranked list across library and outside sources, availability per row, "more releases" folding | <span class="pill t-lib">Sonora</span> S03–S04, S32 |
| Book · Show · Episode · Album | `GET /items/{ref}` | MediaHeader data (actions, progress, rating), episodes with sort, chapters or tracks, about text, related, a book's other narrations | <span class="pill t-lib">Sonora</span> S01–S02, S35 |
| Artist · Author · Series | `GET /people/{ref}`, `GET /series/{ref}` | owned works grouped; unowned works greyed out (on by default) | <span class="pill t-req">mock only</span> |
| Shelf ("See all") | `GET /feed/shelves/{id}` | paged items | <span class="pill t-lib">Sonora</span> UI kit collection screen |
| Now Playing · mini-player · queue · lyrics | `POST /play`, `GET /queues`, `GET /lyrics/{ref}` | plan (with transport variant and direct or transcoded quality), per-type queues, synced lyrics, about cards | <span class="pill t-lib">Sonora</span> S33–S43 |
| Requests | `GET /requests` | status, %, source, size, retry | <span class="pill t-req">mock only</span> |
| Downloads (Android) | local, plus `GET /items/{ref}` | what's on the device, size, remove | <span class="pill t-req">parts</span> DownloadButton, no screen |
| Settings · onboarding | `GET/PUT /settings`, `/setup`, `/auth` | theme, autoplay rules, services, providers, requests | <span class="pill t-lib">Sonora</span> UI kit settings screen |

::: callout warn
**Still to design on the Auralis canvas, before their milestone:** the YouTube channel settings (SponsorBlock, Shorts) and the YouTube account connection, provisional sections of the Show and Settings pages, and loading and empty states per screen. Everything else has a Sonora component and a reference screen. Nobody invents UI in code.
:::

### How parity stays true

- Both clients consume the same generated models and screen endpoints, so no logic is ported by hand.
- Each screen has a shared set of recorded API responses (one per state: loading, empty, full, error). Web (Playwright) and Android (Paparazzi) render the same set as screenshots. Each page's render sits beside its Sonora UI kit render in a committed comparison under `design/app/compare`, with the differences listed, and a test fails when a page changes without a fresh comparison.

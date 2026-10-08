# Backdrop Nav — Architecture & Rust path

## Layers

```
DATA (edited by design / product)          app/app.json (config) · app/texts + design/texts (locales, merged by app/load-app.js) · design/ (tokens, components, choreography) · api/invariants.js (rules)
CONTRACT (source of truth)                  api/api.d.ts
CORE (logic, written once)                  core/*.js today → Rust crate later
SHELLS (drawing + motion + audio)           web mockup today (Backdrop Nav Skeleton + component DCs + platforms/web/motions.js) → Compose (Android), web UI (web + Tauri desktop)
SERVER                                      backend; speaks the contract's data section (§3, §16)
```

Rules of thumb
- What happens → contract + core. What it looks like per state → component specs + tokens.
  How it moves → choreography + motion tokens. How it's drawn → shells.
- Core never draws, never runs timers, never measures. Shells never decide.
- Navigation/UI state never leaves the device. Playback + library sync through the server.

## Core modules (JS today) → Rust crate layout (later)

| api.d.ts §            | JS (reference impl)       | Rust module (crate `nav_core`)          | Notes |
|-----------------------|---------------------------|-----------------------------------------|-------|
| 1–8 nav               | core/navigation.js            | `nav::{config,policy,state,reduce,query}` | pure reducer: `fn reduce(&State, Intent, &Config) -> (State, Vec<Event>)` |
| 9 overlay             | core/navigation.js            | `nav::overlay`                          | |
| 10 session            | core/navigation.js            | `nav::session`                          | |
| 11 route              | core/navigation.js (url, navigateUrl) | `route`                         | web shell mirrors `urlChanged` to `history.pushState`; Android maps intents/deep links |
| 12 persist            | core/navigation.js (snapshot, restore) | `persist` (serde)              | Android: save on `onStop`; web: `localStorage` |
| 13 player             | core/player.js           | `player`                                | shells execute `PlayerCommand`s; report facts back |
| 14 layout             | core/layout.js     | `layout`                          | shells pass measured rects in; sizes come through a Look (composition + design) |
| contracts, composition | api/contracts.js (data) · core/compose.js · core/contracts.js | `compose` (placements, hires, look) · `contracts` (the contract tree) | contracts and composition.json are data (serde); the tree is a pure function of state + config + composition + design |
| 15 specs              | design/ (load.js assembles, resolves extends; motions/ = motion kinds) · generated/ (build.js) · platforms/*.json (manifests) | `specs` (serde + JSON Schema validation) | validated at startup / in CI; build.rs can emit the Kotlin/CSS tokens |
| 16 wire               | app/fake-backend.js (fake data; config in app/app.json via serde) | `data` (reqwest, cache, offline)      | shares data types with the backend if it's Rust |
| rules                 | api/invariants.js · api/composition-rules.js | `tests/` + data-driven `rules.yaml` runner | same rules for every implementation |

## Bindings

- Android: UniFFI → Kotlin. Model lives in a `ViewModel`; `send(intent)` → `dispatch` → `StateFlow` + event `SharedFlow`.
  Compose renders `layout` descriptors; Media3 executes `PlayerCommand`s; `BackHandler` → `Intent::Back`.
- Web: `wasm-bindgen` → TS. Same loop; CSS / Web Animations run descriptors; `<audio>` + Media Session.
- Desktop: Tauri. Rust side owns core + audio (symphonia/cpal) + OS media keys; UI = web build.

## Migration plan

1. Freeze contract v1 (api.d.ts) and move rules to data (`rules.yaml` + tiny runners per language).
2. Port `core/*.js` (navigation, layout, interaction, player) → `nav_core` module by module; run the rules in `cargo test` until green.
3. Ship the wasm build into the web shell behind the same intents/queries (swap the JS core).
4. Android: UniFFI bindings; replace ad-hoc navigation with the core; Media3 driven by `player`.
5. Desktop: Tauri wrapping the web UI + Rust audio.
6. Backend: generate shared data types (Rust crate or from the neutral schema).

## Decisions
- Single window on every platform (contract §19).
- Versioning: semver on the contract; see CHANGELOG.md.

## Open contract areas (not decided yet)

- Notifications / Android Auto entry points (deep link format beyond URLs).
- Search as a global intent vs per-deck basic action.
- Screen-reader announcements (live regions for snackbars, content state changes).

## interaction (§20)
- `core/interaction.js` → crate `interaction`: pure, depends on `nav` (supports) and `player` (supports). Shells feed raw input, draw spec visuals.

## Contract in Rust
- `api/api.d.ts` stays the source; `api/api.rs` will be generated from it when the Rust core starts (the 11.0.1 snapshot was deleted in 18.0) (serde structs / tagged + untagged enums / traits; recursion via Box). Generator: currently an ad-hoc script — make it a checked-in `api/gen-rust.js` when the Rust core starts, and add a rule that api.rs is up to date.

## 13.0
- New modules map as before; `Role.slots` is data (validated by the rules runner). Player access from config = the core holds an optional `&PlayerModel` (trait object) for '$player' paths and PlayerIs.

## 14.2 / 14.3 additions to port
- Role appBar slot `bottom` (contract only).
- `playerAction(player, intent, from)` → { commands, events: [QueuedEvent] } — in the interaction module (`nav::interaction`).

## 15.0 to port
- `BarView.distance`; `Layout::content_offset(page, specs) = max(0, scroll − distance)`. Scroll stays one f64 per page; its meaning is collapse-first (platforms split it into bar collapse + native content offset).

## 16.0 to port (superseded by 18.0: skip)
- Typed refs are type aliases over ComponentRef with typed slot maps (`HashMap<String, Vec<Slot>>` + named fields). `Role.parts` (`PartContract`) is data like `Role.slots`. Roles come from api/roles.js — port it as data (serde from JSON), not code. New role ids and their roleProps / roleIntent arms; `Layout::component_for(specs, role)`; `SlotContext.layer`.

## 17.0 to port
- Steps are data (serde, tagged by `do`); `Layout::steps_for`, `component_steps` resolve tokens / ByEvent / sequences. Platforms (Compose, web) implement tween / travel / swap / reveal; measures resolve on the platform. KindStep is temporary.

## 18.0 to port
- Config items are tagged enums by `kind` (button · logo · text · switch · find · detail · seek); BackLayerConfig has fixed regions. No roles, refs or slot paths.
- `CONTRACTS` (api/contracts.js) and app/composition.json are data (serde). `compose::placement_for`, `hire_of`, `look_at` (size / visuals per place); `contracts::contract_tree(model, specs, composition, ctx) -> ContractTree`, whose node events return an Intent, an action or nothing.
- `create_model(config, sizes)`: Layout.sizes(look) gives rail and side-sheet widths. FrontState / AppBarPageState gain `find`; intents OpenFind / CloseFind.

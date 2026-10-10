# Project rules

## Approval
- Changes inside `design/` and `core/` may proceed, and so may the component DCs (`*.dc.html` that implement design components) and the Components page. Anything else (api/, app/, platforms/, the mockup shell `Backdrop Nav Skeleton.dc.html`, docs/, CLAUDE.md) — ask first, and say which files and why.
- Don't state guesses as facts. When I don't know something (what a thing is, which parts it has, what the user means), say so and ask.

## API
- API changes need approval first. Before editing `api/api.d.ts` or `api/invariants.js` (shapes, intents, events, queries, rules), describe the proposed change (TS diff or bullet list + version impact + which files/layers it touches) and wait for the user's OK.
- Every turn that changes the API is a release: bump the version for it (minor = additive/optional, major = breaking). A release counts as released once the user has moved on from it; until then, fixes to it (missed spots, follow-ups found while reviewing it) amend that same version and its CHANGELOG entry instead of opening a new one. Never fold changes into a version the user has already moved on from. Check the bump honestly — removals, renames and new required fields are major.
- Don't leave loose ends: when changing something, update everything it touches (core, invariants, app config, design, platform manifest, mockup + component DCs, Specs Editor, Components preview, docs/API.md, docs/CHANGELOG.md, docs/NOTES.md, docs/RUST.md). Run the rules after every change and report the count.

- Type style (api.d.ts): every object shape is a named type; unions list named members (`type A = B | C`); no anonymous `{ }` in fields; every type is defined before it is used (recursive cycles: one marked forward reference). A config type's state, policy and contract types take its full name: `XConfig` · `XState` · `XStatePolicy` · `XContract` (BackLayerConfig → BackLayerState, not BackState).

## Before claiming or building anything
- Look it up first, in this order: api/api.d.ts + api/contracts.js (shapes, contracts and their children) → app/app.json + app/composition.json (which pages and items exist, which component each contract hires) → design/components/<id>/ + design/design.json (what is registered, its visuals and .md) → docs/NOTES.md + CHANGELOG.md (why it is so). Quote what you found; if it isn't there, say "not defined" — never fill the gap from the DOM or from memory.
- What a thing is, which parts it has and what uses it come from those files, never from how a .dc.html happens to be nested.
- Before converting or refactoring anything, take stock first: read all of it and list everything it does itself (draws, lays out, decides, picks components, reads design for others, writes texts, fakes data, runs motion). Record the list (the shell's is docs/NOTES.md, "Shell conversion list"), then convert in the order it gives, ticking items as they go.

## Components
- A component DC exists only for a component registered in design (design/components/<id>/). No DC without a design component; no design component drawn by two DCs or by the shell. Name the DC after it (frontLayer → FrontLayer.dc.html).
- Its structure follows the API: its contract's children / the config shape it draws (e.g. header: items · detail; an app-bar page: header · content | body · sheet). Its look comes only from its design visuals.
- Missing design component? Stop and propose it (design files + manifest), don't create the DC first.
- Never move shell markup into files mechanically and call them components. A DC's header comment names its real design component; if there is none, the file is wrong.

## No mockup-only changes
- Never make a change only in the mockup / platform code. Every look-and-feel value (sizes, paddings, fonts, colours, radii, timings) lives in design (tokens, component visuals, motions); every arrangement, text or behaviour choice lives in config (app/app.json, texts); anything else needs an API change (propose first). The platform only reads them and draws.
- If a fix seems to need only shell code, first find the design value or config field it should come from (add one if missing), then make the shell read it.
- Never describe a change as "mockup-only" — if that is what it is, it is in the wrong place.
- The motion player (platforms/web/motions.js) defines nothing of its own: every value, keyframe position, ordering and choice of which pieces move / fade / stay comes from the choreography steps (and, while temporary kinds remain, their params in design/motions/<id>.json, valued in choreography.json / tokens). Only mechanics stay in the player: layering, keyframe sampling resolution, waiting for a render. A missing param is an error, never a silent 0 / linear.
- Design never refers to names that exist only in platform files. Names the design uses (e.g. a component's parts) are declared in design; platform components use those names.
- Everything the mockup draws is a component: one `.dc.html` per design component (like IconButton, PanelRow), fed its resolved visuals / props by the shell. The shell (Backdrop Nav Skeleton) only arranges component instances — no inline-drawn UI. The Components page previews those same DCs.
- Never add feature or drawing code to the shell, not even temporarily to get something on screen. New behaviour goes into config, design, composition or a component DC; a shell edit is only for removing what it still does itself, and needs my OK first (say which lines and why).

## Division of powers (test before adding anything to the API)
- API = contracts + state + behaviour. Something is in the API only if the engine's behaviour depends on it.
- App config (`app/`) = which pages and items, arrangement, policies, texts (app.json); which component fills each contract (composition.json).
- Design (`design/`) = what components look like and how things move (tokens, components, motions, choreography, design texts).
- Core (`core/`) = one implementation of the API: navigation, layout, interaction, player (optional).
- Platform = draws; publishes a manifest (`platforms/<name>.json`) of components and motions it implements.
- If a look-and-feel tweak would need an API release, that's a sign it's in the wrong layer.

## How it works (as of 18.0.0)
- **State + config.** The engine (core) holds state; config (app/app.json) says what exists as plain data: pages, decks, layers, policies, params and items (button · logo · text · switch · find · detail · seek). Config names no components, slots, sides or sizes. Intents change state; queries and Layout read state + config + design and give the platform what to draw.
- **Contracts.** A contract (api/contracts.js, the single source; api/gen-contracts.js writes its TS block into api.d.ts) is what a drawn config object offers: its config, the values the engine gives it, the intents it can send, its children.
- **Composition** (app/composition.json) hires one free design component per contract: clauses feed its props (from values, fixed tokens, design texts), send its events as intents or the item's action, and fill its slots from children. Placements pick the hire by contract, nearest ancestor, kind / name, param, presentation, state, overlay and layout class; page exceptions (by template) come first. core/contracts.js builds the contract tree: one node per drawn object with its hire, props, slots and events; its keys identify instances. Items whose `when` fails stay in the tree, hidden.
- **Config vs state naming.** Config says how far something may go (`front.collapse`); state says where it is now (`frontPosition`).
- **Design** = what components look like (tokens, component visuals per state, `props`, `optional`, `parts`) and how things move (choreography). Sizes Layout needs come from design through composition (a Look, core/compose.js). Parts are pieces a component draws itself that motion may name (`<component>.<part>`); they are declared in design, never invented by a platform. Components inherit with `extends`; interactive ones extend `interactive`.
- **Motion as steps.** A choreography rule (`on` an event pattern; every field it gives must match) is a list of steps: `tween` (a piece's props), `travel` (a copy flies to another piece / measure), `swap` (fade through around the state change), `reveal` (shown through a moving shape); `use` runs a named sequence. Steps name pieces (`<contract>.<child>`, `<component>.<part>`, `<component>`, `source` / `target` / `origin`, step ids; `[]` lists, `@before` / `@after`), measure geometry after the commit, pick values by event fields (`ByEvent`), and run on time (anchored to other steps) or on progress (bar collapse, scroll). Component motions are steps too (`ComponentDef.motion`, triggers change · press · release · loop). `KindStep` (a hand-built motion kind) is temporary until every motion is ported, then removed with `Specs.motions`, `transitionFor` / `motionFor`.
- **Platform** (TARGET — not built yet; motions.js still plays the hand-built kinds) implements the four blocks once (platforms/web/motions.js), plus mechanics only (sampling, layering, clipping technique, measuring at rest, cleanup). It finds pieces through the DCs' `data-piece` attributes — names from contracts / design only.
- **Component DCs** (TARGET — rebuild not started; current DCs are improvised and use ad-hoc data-* markers) are built from the contract + design (not from old DOM): structure = the contract node's slots + declared parts, each marked `data-piece`; props = `ComponentDef.props` fed by the hire's clauses; events out through the node; look = design visuals (the look the user has seen in the mockup is the reference). One DC per design component; the shell only arranges them. The platform may map component ids to DCs (NOTES decision 32).
- **Rules** (api/invariants.js, Invariants.dc.html) check config, design, contracts, steps and the platform manifest; design-only data checks live in design/checks.js.

## File layout
```
api/        api.d.ts (contract) · contracts.js (contracts as data, single source) · gen-contracts.js (contracts.js → api.d.ts block) · invariants.js (rules) · composition-rules.js (composition against contracts + design)
core/       navigation.js · layout.js · interaction.js · player.js · compose.js (placements, hires, the look) · contracts.js (the contract tree)
app/        app.json · composition.json · texts/<locale>.json · load-app.js · fake-backend.js
design/     design.json · tokens.json · choreography.json (rules → steps, sequences) · motions/ (temporary kinds) · components/<id>/{.json,.md,.d.ts} · texts/ · load.js · build.js · write-generated.mjs (writes generated/ + component .d.ts) · overrides.js · checks.js
platforms/  web.json (manifest) · web/motions.js (player) · lint-web.js (shell lint: no look-and-feel literals or motion code in the shell)
generated/  per-platform tokens (build.js output)
docs/       API.md · CHANGELOG.md · NOTES.md · RUST.md
*.dc.html   Backdrop Nav Skeleton (mockup) · component DCs (IconButton … ContentBlock) · Specs Editor · Components · Invariants
```

## How to answer
- Concise and direct. No preamble, no narration of routine steps.
- When asked how things are organised, show a file tree in a code block (as above) with one-line purposes — not prose.
- When proposing, show the TS shape in a code block, then short bullets: behaviour, rules, design, mockup, version. End with a direct question ("Approve?").
- When asked "where is this added?", answer by layer (API / design / core / platform), one line each.
- Say plainly when something was my mistake or is a mislabel, then fix it.
- After work: what changed, rule count, what's still open (also recorded in docs/NOTES.md).
- Verify before reporting: measure motion / layout in the preview yourself (sample the animations frame by frame). Only call something fixed if the measurement shows it. If you couldn't check, say what is unknown once, specifically — not as a stock line.
- Never present a guess as the cause or a fix. Say "I don't know yet" and what you'll measure.
- Change only what was asked. If something else seems wrong, ask; don't "also fix" it.
- Ask before adding sample content, sections or features the user didn't request; suggest instead.

## Sample app conventions
- Decks: Browse (one-of filters + sort; carousels), Library (tabs music / audiobooks / podcasts; per-tab show / layout / sort / genre / year incl. a from–to range), Search (query + suggestions; submitting conceals the back layer). Layers: Now playing (sheet; the player page with an inner Up next / Lyrics / Related sheet; its peek is the mini player), Settings (id Dedede, circular reveal), Menu (drawer: Listen now / Settings / Account), Account. Dedede's sub-pages keep nonsense names.
- Content: mock catalog in app/fake-backend.js (artists, albums, songs; authors, books, chapters; hosts, shows, episodes). People draw circular, collections square.
- Locales: en (default), fi, de, pt, he (RTL).

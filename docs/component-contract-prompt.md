# Prompt: the component contract (for a Claude Code session)

## First: put the project under git

This project comes from a tool with no version history, so earlier changes can't be diffed or reverted. Before anything else:
1. In the project folder (the downloaded export), run `git init`, add everything, and commit it as `Baseline: export at contract 17.0.0 (in progress)`. Change nothing before this commit.
2. From then on, commit after every step the user agrees to, with a message saying what changed and why. Never squash or rewrite history.

You are working on the Backdrop Nav project. Read `CLAUDE.md` first and follow it. In particular: never state a guess as a fact, quote the file you got something from, and say "I don't know" / "not defined" when it isn't written down. Work one step at a time: propose one small piece, wait for the user, then continue. Don't hand over a full design in one go. Don't change `api/` without the user's explicit OK.

Do not read the component DCs (`*.dc.html`) for this task. They were improvised by earlier sessions and don't reflect the intended design.

## What the user designed and loved

The original API (v1, see `docs/v1-recollection.md`; it is a recollection, not the file) was a model:
- **Config** (fixed: what exists), **State** (current: where it is now), **Policy** (what is preserved / reset, mirroring State's shape) are separate.
- A backdrop page is `BackdropPageConfig { back: BackLayerConfig; front: FrontLayerConfig }`, each with its own State and Policy. App-bar pages are a separate kind.
- **Intents** change State, **Events** report changes, and **Queries** read Config + State.
- Headers were plain data (`HeaderItem { kind: 'caret' | 'back' | 'logo' | … }`). They said what is in a header, not which component draws it.

That structure (especially the abstract parts) is what should be kept.

## What went wrong

Over later releases, components were pushed into the API in ways that buried the model (see `docs/CHANGELOG.md`):
- **2.0.0:** `ComponentRef` (`{ component, props, action, when, slots }`) replaced header items; roles (`Role { supplies, emits }`), `SlotRef<R>`, `roleProps` / `roleIntent`.
- **13.0.0:** slot contracts (`Role.slots`, `SlotContract`). The API started knowing component shapes.
- **16.0.0:** typed refs (`BarRef`, `FrontHeaderRef`, …) and roles for pages / surfaces (`backdropPage`, `backLayer`, `frontLayer`, …) with `Role.parts`. Roles now live in `api/roles.js`.
- **17.0.0** (in progress): motion steps that name pieces by role slots / parts.

The result is one concept with many names: ref, role, supplies, emits, slots, parts, roleProps, roleIntent, typed refs. Plus `provides` / `SurfaceRole` (surface colours), which share the word "role" but are unrelated. The user does not understand how these fit together, and nobody wrote down a coherent design.

Facts found (check them yourself):
- `design/components/<id>/<id>.d.ts` files are stale. For example `appBar.d.ts` has an empty `AppBarProps {}`, while `appBar.json` declares 7 props. `design/build.js` would emit them now; it hasn't been rerun.
- `frontLayer.json` / `backLayer.json` declare no slots or parts for their header / content / regions. Those are only named in `api/roles.js` (16.0).
- `provides` (15 surface components, names `content` / `contentVariant` / `focusRing`) is read only at `core/layout.js` line 87. The API types it (`ComponentDef.provides`, `SurfaceRole`, `VisualContext.surface`) but doesn't explain it.

## What we are trying to do

Define, **as types in the API**, the contract between a component and the model: "here is what a component of this kind must be, so that the Config and State objects can be drawn by it and changed through it." The middle ground the user wants:
- The API keeps its model structure (Config / State / Policy / Intents / Events / Queries).
- The things the API talks about have names (front layer, back layer, front header, disclosure, …), and design must build components that meet those named contracts directly.
- The API can also say "this place inside that thing can be any component."
- Not every Config type is drawn by a component. Engine-only Config (`PagePolicy`, `RouteConfig`, `BackLayerConfig.layouts`, …) has no component. The types should make that distinction explicit.

Working example: `BackdropPageConfig` in full (back layer with its regions and basic action, front layer with its header and content), and the parts of `AppState` it uses.

A first, unvetted sketch from the previous session. It is a starting point, not a decision:
```ts
interface Component<C, S, I extends Intent> { config: C; state: S; send(intent: I): void }
type FrontLayerComponent = Component<FrontLayerConfig, /* ? */ unknown, ScrollIntent | RetryIntent>;
type DisclosureComponent = Component<DisclosureConfig, { expanded: boolean }, ToggleExpandedIntent>;
```

Known open questions with this sketch (not answered):
1. **Nesting:** `FrontLayerConfig.header` is a `FrontHeaderConfig`. How does the type say the front layer contains a front-header component, and who draws it?
2. **"Any component here":** how is an open place typed, and what is a component placed there given (values bound to State, actions as Intents)?
3. **What `state` is:** State, Layout output (positions such as `FrontLayerView`), or both?
4. **Whole Config or not:** does a component get all of its Config type, or only the fields it draws?
5. **Rules:** `api/invariants.js` is JavaScript and can't read TypeScript. How are the contracts made available to the rules without a second hand-kept copy?
6. **What replaces** refs / roles / roleProps / roleIntent, and what happens to app.json's current component trees (refs with slots)?

## How to proceed

1. Read `api/api.d.ts` (§B values, §G–§I config / state, §F refs and roles, §L queries, §M2), `api/roles.js`, `docs/v1-recollection.md`, `docs/CHANGELOG.md`, and the `docs/NOTES.md` sections on component contracts.
2. Start from the working example. Propose one piece at a time (e.g. the generic component type, then the front layer, then its header), and say what is uncertain in each.
3. When the user agrees on a shape, follow `CLAUDE.md`'s API rules: TS diff, version impact, files / layers touched, and wait for approval.

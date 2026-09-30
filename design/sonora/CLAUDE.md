# Sonora — working notes

## Where things live

One hierarchy, as the plan's front-end chapter sets it: `tokens/`, then `components/basic/` (the
pieces built only on tokens), `components/components/` (cards, rows, transport and headers built
from them) and `components/layouts/` (the backdrop shell, sections, shelves and the player's
containers and pages). A component reaches only its own level or an earlier one. Each folder
keeps its components' showcase cards (`*.card.html`) beside them.

Every component is drawn by at least one page of the Auralis canvas (`design/app/pages`),
directly or through another's `NS()` lookup; `design-codegen/src/prune.test.ts` holds that. A
component no page uses is deleted everywhere, not kept for later.

## Keep the export in step with the sources

`export/` holds generated views of this system, and `pnpm gen` in the Auralis root runs
`export/generate.js` to build the web and Android tokens and the generated component props.

**After changing any `tokens/*.css` file or any component `.d.ts`, regenerate in the same change:**

```
node docs/run_generate.mjs   # from design/sonora: export/web, export/android, export/component-api.md
pnpm gen                     # from the Auralis root: web/src/generated, the Android props
```

Never hand-edit `export/web/*`, `export/android/*` or `export/component-api.md` — they are overwritten.
`_ds_manifest.json` comes from `python3 docs/update_manifest.py` and `_adherence.oxlintrc.json` from
`python3 docs/gen_adherence.py`; rerun both when a component or card is added, moved or deleted.

## Conventions

- Components read tokens; nothing hardcodes a colour, duration, easing curve or icon size.
- Motion names a role (`--duration-fast` etc.), never a number, and uses `--ease-standard`.
- Scrims over artwork are `--scrim*`/`--on-scrim`; hover, focus and press washes are `StateLayer`'s.
- Every component has a sibling `.d.ts` — it is the source for `export/component-api.md`, so document
  props there, not only in the JSX.

## Keep the Design System artifact in step too

Sonora is also published as a claude.ai **Design System artifact**
(https://claude.ai/artifact/CUW4CN7KpxgvjeWnbhTQBB), which the Auralis design canvas installs. It is
generated from this repo, never edited by hand:

```
pnpm sonora:build    # from the Auralis root: build/sonora/project/**, canvas/tokens.css, stamp.json
```

then the Auralis orchestrator publishes `build/sonora/project/**` to that url with the Artifact tool
(`.d.ts` files as `text/plain`), records it with `record-publish.mjs --artifact sonora`, and rebuilds
the canvas (`pnpm canvas:build`), which installs this publish. Do this in the same turn as any change
to `tokens/`, a component or its `.d.ts`.

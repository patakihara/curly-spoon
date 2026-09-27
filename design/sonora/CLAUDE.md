# Sonora — working notes

## Keep the export in step with the sources

`export/` holds generated views of this system for the consuming codebase
(`patakihara/curly-spoon`: web `packages/ui`, Android `apps/android`).

**After changing any `tokens/*.css` file or any component `.d.ts`, regenerate the export in the same
turn**, with a `run_script` call:

```js
const src = await readFile('export/generate.js');
await new Function(src + '; return generateExport;')()({ readFile, saveFile, ls, log });
```

Never hand-edit `export/web/*`, `export/android/*` or `export/component-api.md` — they are overwritten.
`export/DRIFT.md` is hand-written; update it when the values that repo vendored change, or when a
component gains behaviour the token layer cannot carry.

## Conventions

- Components read tokens; nothing hardcodes a colour, duration, easing curve or icon size.
- Motion names a role (`--duration-fast` etc.), never a number, and uses `--ease-standard`.
- Scrims over artwork are `--scrim*`/`--on-scrim`; surface washes are `--surface-hover`.
- Every component has a sibling `.d.ts` — it is the source for `export/component-api.md`, so document
  props there, not only in the JSX.

## Keep the Design System artifact in step too

Sonora is also published as a claude.ai **Design System artifact**
(https://claude.ai/artifact/CUW4CN7KpxgvjeWnbhTQBB), which the Auralis design canvas installs. It is
generated from this repo, never edited by hand:

```
curl -sSo /tmp/babel-standalone.js https://unpkg.com/@babel/standalone@7.29.0/babel.min.js  # once
node docs/build_bundle.js && node docs/build_artifact.js    # -> .artifact/project/** (gitignored)
```

then publish `.artifact/project/**` to that url with the Artifact tool (`.d.ts` files as `text/plain`),
and re-install it on the canvas (copy `tokens.json` + `components/bundle.*` from the system, plus
`.artifact/canvas/tokens.css`). Do this in the same turn as any change to `tokens/`, a component or its `.d.ts`.

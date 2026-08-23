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

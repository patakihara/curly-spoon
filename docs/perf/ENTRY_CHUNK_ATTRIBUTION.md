# Entry chunk byte attribution — wave 14a-1

Measurement only. No product code changed in this wave.

## Method

Built `apps/web` with `vite build --sourcemap` (CLI flag, `vite.config.ts` untouched).
Entry chunk: `dist/assets/index-D4_poXRT.js` — **666,616 bytes raw** (matches the
203.50 kB gzip / 666.57 kB raw figure already in `docs/ROADMAP.md` §10).

A throwaway script (`scripts/tmp-entry-attribution.mjs`, deleted before this commit)
hand-decoded the entry chunk's `.js.map` (base64-VLQ `mappings`, no dependency
installed) and attributed the byte range between each pair of consecutive mapped
generated positions to the **earlier** position's `sources[]` entry. That's an
approximation, stated explicitly: it assumes minifiers emit a mapping at (close to)
every token boundary, which is true enough in practice for Vite's esbuild/Rollup
minification to give directionally reliable, roughly-proportional numbers — but a
byte attributed to package X really means "the generated code between this mapping
and the next one, which is _probably_ still inside X." Treat single-digit-percent
differences between neighbouring rows as noise; the order-of-magnitude picture is
solid.

662,969 of 666,616 bytes (99.5%) were attributed to a named source; the remainder is
Vite/Rollup preamble and unmapped glue.

Grouping: node_modules paths grouped by npm package (last `node_modules/` segment,
so pnpm's `.pnpm/<name>@<ver>/node_modules/<name>/...` layout resolves to `<name>`,
scoped packages kept as `@scope/name`). First-party paths grouped by top-level
directory under `apps/web/src/*` or `packages/*/src/*`.

## Top 25 rows (bytes, cumulative % of raw file size)

| #   |   Bytes |  Cum% | Group                                |
| --- | ------: | ----: | ------------------------------------ |
| 1   | 181,760 | 27.3% | `react-dom`                          |
| 2   | 153,192 | 50.2% | `@mantine/core`                      |
| 3   |  59,891 | 59.2% | `@tanstack/router-core`              |
| 4   |  51,848 | 67.0% | `@material/material-color-utilities` |
| 5   |  38,626 | 72.8% | `@tanstack/query-core`               |
| 6   |  24,923 | 76.5% | `packages/ui/src/components`         |
| 7   |  21,849 | 79.8% | `@floating-ui/react`                 |
| 8   |  20,632 | 82.9% | `apps/web/src/api`                   |
| 9   |  16,746 | 85.4% | `@tanstack/react-router`             |
| 10  |   9,581 | 86.9% | `@floating-ui/core`                  |
| 11  |   8,893 | 88.2% | `react`                              |
| 12  |   7,333 | 89.3% | `@floating-ui/dom`                   |
| 13  |   6,011 | 90.2% | `@mantine/hooks`                     |
| 14  |   5,824 | 91.1% | `react-remove-scroll`                |
| 15  |   5,097 | 91.8% | `packages/ui/src/tokens`             |
| 16  |   4,685 | 92.5% | `@tanstack/store`                    |
| 17  |   4,522 | 93.2% | `@tanstack/history`                  |
| 18  |   4,191 | 93.8% | `apps/web/src/router`                |
| 19  |   3,926 | 94.4% | `@floating-ui/utils`                 |
| 20  |   3,903 | 95.0% | `scheduler`                          |
| 21  |   3,593 | 95.6% | `apps/web/src/components`            |
| 22  |   3,273 | 96.1% | `@floating-ui/react-dom`             |
| 23  |   2,758 | 96.5% | `@tanstack/react-query`              |
| 24  |   2,666 | 96.9% | `zustand`                            |
| 25  |   2,398 | 97.2% | `packages/ui/src/theme`              |

(Rows 26–41, each under 1% of total, omitted here — `react-remove-scroll-bar`,
`use-sync-external-store`, `apps/web/src/features`, `apps/web/src/main.tsx`,
`apps/web/src/hooks`, `use-sidecar`, `@vite-plugin-pwa/virtual:pwa-register`,
`apps/web/src/state`, `tslib`, `react-style-singleton`, `use-callback-ref`,
`packages/ui/src/internal`, `clsx`, `@tanstack/react-store`, `apps/web/src/pwa`,
`get-nonce`.)

## Named-package sizes asked for explicitly

| Package                                                         |                                       Bytes | Note                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@material/material-color-utilities`                            |                                      51,848 | present, rank 4                                                                                                                                              |
| `@mantine/core`                                                 |                                     153,192 | present, rank 2                                                                                                                                              |
| `@tanstack/react-query` (+`query-core`, `react-store`, `store`) |       2,758 + 38,626 + 250 + 4,685 = 46,319 | most of the weight is `query-core`, the framework-agnostic engine `@tanstack/react-query` wraps                                                              |
| `@tanstack/react-router` (+`router-core`, `history`)            |            16,746 + 59,891 + 4,522 = 81,159 | this is the router in use (confirmed: `apps/web/src/main.tsx` imports `RouterProvider` from `@tanstack/react-router`)                                        |
| `zustand`                                                       |                                       2,666 | present, rank 24, small                                                                                                                                      |
| Icon package                                                    | **none found as a separate npm dependency** | icons render through `packages/ui/src/components/Icon.tsx` (part of the `packages/ui/src/components` 24,923-byte group), not a third-party icon font/package |

`@floating-ui/*` (react/core/dom/utils/react-dom) sums to 21,849 + 9,581 + 7,333 +
3,926 + 3,273 = **45,962 bytes**, none imported directly by first-party code (see
below) — it is Mantine's own popover/positioning dependency, pulled in transitively.

## Per-row deferrability, top 8

Method: `Grep` on the import specifier against `apps/web/src/main.tsx`,
`packages/ui/src/theme/*`, and route/feature files, not a full read of any file.

1. **`react-dom` (181,760 B, 27.3%) — not deferrable.** `apps/web/src/main.tsx:2`
   imports `createRoot` from `react-dom/client` directly. This is the render root;
   the app cannot paint anything, first or otherwise, without it. No cost to
   discuss — there is no alternative.

2. **`@mantine/core` (153,192 B, 22.9% alone) — not deferrable as currently wired,
   but the _how_ is the finding.** Not imported by `main.tsx` directly. It's
   imported by `packages/ui/src/theme/ThemeProvider.tsx:24`
   (`import { MantineProvider } from '@mantine/core'`), and `ThemeProvider` is
   imported eagerly by `apps/web/src/components/RootLayout.tsx:24` — which is
   wired into `apps/web/src/router/routeTree.ts:10` as the **root route's**
   `component`, not a leaf, so it is never route-code-split by
   `lazyRouteComponent`. `MantineProvider` wraps the whole app, so genuinely
   deferring it means deferring first paint of the shell itself — this one is
   architecturally required for anything to render styled at all. Cost of forcing
   it lazy: a flash of unstyled content, which is very likely worse UX than the
   current 6s FCP, so not recommended as-is.

3. **`@tanstack/router-core` (59,891 B, 9.0%) — not deferrable.** Required by
   `@tanstack/react-router`, which `main.tsx:4` imports directly for
   `RouterProvider`. Routing has to exist before anything renders; this is
   foundational, same bucket as react-dom.

4. **`@material/material-color-utilities` (51,848 B, 7.8%) — plausibly deferrable,
   but not free.** Not imported by `main.tsx`. It **is** imported by
   `packages/ui/src/theme/mantineColors.ts:15` (`mantineTupleFromHex`), which
   `ThemeProvider.tsx:31` imports and calls synchronously to build the initial
   Mantine theme palette from a base colour. It is also used by
   `packages/ui/src/tokens/{color,artwork}.ts` for the artwork-derived
   runtime recolouring described in `DESIGN.md`. Deferring it means either (a)
   shipping a static/precomputed default palette for first paint and lazily
   upgrading to the real HCT-derived one once the module loads (real work, touches
   `ThemeProvider`'s init path), or (b) accepting a theme-color flash. Real
   candidate, not a one-line change.

5. **`@tanstack/query-core` (38,626 B, 5.8%) — not deferrable as wired.**
   `main.tsx:3` imports `QueryClientProvider` from `@tanstack/react-query`
   directly, which depends on `query-core`. `main.tsx:9` also constructs the
   query client (`createAppQueryClient`) before render. Deferring react-query out
   of the entry would mean not wrapping the app in `QueryClientProvider` until
   after some async import resolves — plausible in principle (render a loading
   shell, then swap in the provider) but is a structural change to `main.tsx`,
   not a route-split.

6. **`packages/ui/src/components` (24,923 B, 3.7%) — the clearest deferral
   candidate found in this pass.** `packages/ui/src/index.ts` does
   `export * from './components/index.js'`, a single barrel that re-exports
   **all 21** components (`Button`, `Dialog`, `Sheet`, `Snackbar`, `Menu`, `Fab`,
   `Slider`, `TopAppBar`, `SearchField`, …). `RootLayout.tsx:24` imports only
   `{ CircularProgress, ThemeProvider }` from `@auralis/ui`, but because it's a
   barrel import and `RootLayout` is eager (root route, not lazy), **every**
   component in the barrel gets pulled into the entry chunk regardless of
   whether any route currently mounted uses it. This is very likely also why
   `@floating-ui/*` (45,962 B combined, rows 7/10/12/19/22) shows up at all —
   Mantine's `Menu`/`Popover`-based components (e.g. this package's `Menu.tsx`)
   depend on it, and none of `packages/ui/src/components` or `apps/web/src`
   imports `@floating-ui` directly (`grep -rln "@floating-ui"` over both trees
   returned nothing) — it's fully transitive, pulled in only because the whole
   component barrel loads. **Cost to defer: not a route-split, since these are
   library components used across many already-lazy routes — the fix is
   sub-path exports (`@auralis/ui/components/Dialog` etc.) or per-component
   entry points so `RootLayout`'s `import { CircularProgress, ThemeProvider }`
   stops pulling in `Dialog`/`Sheet`/`Snackbar`/`Menu`/etc. that no eager code
   path needs.** This is a packaging change to `packages/ui`'s exports map, not
   a one-line lazy import, but it's bounded and mechanical, unlike items 2–5.

7. **`@floating-ui/react` (21,849 B, 3.3%) — deferrable, same root cause as #6.**
   Not imported anywhere in `apps/web/src` or `packages/ui/src` directly (grepped
   both trees for the import specifier — zero hits). It rides in purely because
   `Menu.tsx` (or another Mantine-Popover-based component) is part of the eager
   barrel described above. Fixing #6 removes this for free; no separate work
   needed.

8. **`apps/web/src/api` (20,632 B, 3.1%) — not deferrable, and arguably
   shouldn't be.** This is first-party API-client code
   (`ApiContext.tsx`, `errors.ts`, `client.ts`, `queries.ts`, `queryClient.ts`),
   imported by `main.tsx:8-9` (`ApiProvider`, `createAppQueryClient`) directly —
   the app needs a configured API client before it can render any
   authenticated route, including the login screen. Not a byte-shaving target;
   it's the app's own thin glue, not a heavy dependency.

## Ranked shortlist for the next wave

1. **Split `packages/ui`'s barrel export (#6/#7 combined, ~46,772 B / 7.0% of
   entry, `24,923 + 21,849`).** Bounded, mechanical, no UX flash risk — the
   components being deferred (`Dialog`, `Sheet`, `Snackbar`, `Menu`, `Fab`, etc.)
   are not needed at first paint by any current eager import. Highest
   confidence-to-cost ratio of anything found here.
2. **Defer `@material/material-color-utilities` behind a static default palette
   (#4, 51,848 B / 7.8%).** Bigger win, real design work: needs a fallback
   palette for the pre-hydration flash and a plan for re-theming once the module
   loads. Worth scoping as its own wave rather than folding into #1.
3. Everything else in the top 8 (`react-dom`, `@mantine/core`'s core import,
   `@tanstack/router-core`, `query-core`, `apps/web/src/api`) is load-bearing for
   first paint as currently architected — deferring any of them means
   restructuring `main.tsx`'s render sequence itself (e.g., a loading shell that
   swaps in `QueryClientProvider`/`MantineProvider` post-load), which is a much
   larger and riskier change than #1 or #2 and should be scoped separately if
   pursued at all.

## What this does not establish

- No measurement of whether shaving these bytes actually moves the Lighthouse
  mobile score — `docs/ROADMAP.md` §10 already found route-level splitting (which
  this is, structurally) "moved no score" once, for a different cut of the same
  problem (vendor `manualChunks`). This wave is attribution only; the next wave
  should re-measure Lighthouse after any change, not assume the byte count and
  the score move together.
- The VLQ-mapping-gap approximation is not exact; do not treat two rows within a
  few percent of each other as meaningfully ordered.

## What 14a-2 changed

Acted on shortlist item #1. `packages/ui/package.json` had no `sideEffects`
field, so Rollup assumed every module might have side effects and could not
tree-shake unused re-exports out of the barrel (`packages/ui/src/index.ts`).
Added `"sideEffects": ["**/*.css"]` — every non-CSS module is now pure, CSS
imports stay side-effectful. Entry raw dropped 914.2 KB → 782.5 KB (-131.7 KB,
-14.4%), entry gzip 237.0 KB → 198.9 KB (-38.1 KB, -16.1%). `@floating-ui/react`
left the entry chunk's sourcemap sources entirely (confirmed via
`vite build --sourcemap`, then inspecting the entry map's `sources` array).

**A CSS-loss check was run before this was called done**, because a purity
declaration can silently drop a component's CSS import along with its module
if something reaches that component only through a path Rollup can't see
statically. Total CSS bytes across `dist/assets/*.css` were compared byte-for-
byte and by class-name diff between a clean baseline build and this change:
269,523 → 268,482 (-1,041 B), entirely `TopAppBar`'s four `.m3-top-app-bar*`
rules — a component with no reference anywhere in `apps/web` (only the `ui`
package's own gallery imports it), so its removal is correct, not a loss.
Every other component's CSS was confirmed still present somewhere in
`dist/assets/*.css`, including `Sheet`/`Snackbar`/`Menu` specifically (present
in their own lazy chunks' `.css` files) since those were flagged as the most
likely to be reached only through an indirection.

Found in passing, not caused by this change: `Chip.tsx`, `CircularProgress.tsx`,
`LinearProgress.tsx` and `Skeleton.tsx` each has a colocated `.css` file that
the component itself never imports — confirmed identical (i.e. already absent
from the bundle) in a clean baseline build made before this wave's edit. Their
current visuals come entirely from Mantine's own styling; `Skeleton.tsx`'s own
comment already documents this for that one. Dead files, pre-existing, out of
this wave's scope — worth a follow-up to delete them.

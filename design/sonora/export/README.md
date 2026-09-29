# Export

Generated views of this design system for the Auralis web and Android apps. **Every file here is
derived — never hand-edit one.** Change `tokens/*.css` or a component's `.d.ts`, then regenerate
with `node docs/run_generate.mjs` from `design/sonora`, and `pnpm gen` from the Auralis root.

| file | for |
| --- | --- |
| `web/sonora-tokens.css` | the token families that are the same in both themes (`:root`) |
| `web/sonora-theme.css` | the theme-dependent families, one block per theme — rescope the selectors to your theme root |
| `android/SonoraTokens.kt` | Compose `Color`/`Dp`/`TextUnit` values plus the motion curve; `package` line is a placeholder |
| `component-api.md` | every component's props, types and notes, from the `.d.ts` files |

## What ports and what doesn't

Tokens and prop signatures transfer near-losslessly. Layout bodies do not: flex/grid with `gap`,
`auto-fill minmax()`, `aspect-ratio`, percentage-height chains and `position:absolute; inset:0` overlays
are a rewrite against Compose's `Row`/`Column`/`LazyVerticalGrid`/`Box`. Neither do the DOM-specific
parts: ResizeObserver self-measuring (MediaHeader, MediaCard's compact badge),
the `clip-path` reveal, `-webkit-line-clamp`, and scroll progress from captured scroll events — each has
a Compose equivalent (`onSizeChanged`, `maxLines`, `nestedScroll`, circular reveal), but as its own
implementation.

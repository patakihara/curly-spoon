# Self-hosted fonts

Sonora's three families, served by the app from its own origin, so the container makes no
request to an outside host. `fonts.css` has the `@font-face` rules. `main.tsx` imports it.
Android has the same families as TTF in `android/sonora/src/main/res/font`.

`scripts/fonts/fetch.mjs` fetched every file here once, by hand. It is never run by a test or
by CI. Run it again to refresh them.

| File                             | Family                   | Subset    | Bytes     | Source                                                                                   |
| -------------------------------- | ------------------------ | --------- | --------- | ---------------------------------------------------------------------------------------- |
| `inter-latin.woff2`              | Inter                    | latin     | 48,256    | the tag `legacy`, `packages/ui/src/styles/fonts/`                                        |
| `inter-latin-ext.woff2`          | Inter                    | latin-ext | 85,068    | the tag `legacy`, `packages/ui/src/styles/fonts/`                                        |
| `archivo-latin.woff2`            | Archivo                  | latin     | 90,104    | Google Fonts, `css2?family=Archivo:wdth,wght@62.5..125,100..900`                         |
| `archivo-latin-ext.woff2`        | Archivo                  | latin-ext | 86,240    | Google Fonts, the same query                                                             |
| `material-symbols-rounded.woff2` | Material Symbols Rounded | all icons | 3,116,888 | Google Fonts, `css2?family=Material+Symbols+Rounded:opsz,wght,FILL@20..48,100..700,0..1` |

The queries are the ones Sonora's own `tokens/fonts.css` and `styles.css` use. Each file is a
variable font: Inter carries weight 100 to 900, of which `fonts.css` declares Sonora's 400 to
900, Archivo weight 100 to 900 and width 62.5 to 125%, and the icon font weight 100 to 700,
optical size 20 to 48 and FILL 0 to 1.

## Why the icon font is whole

Icons are ligatures, and glyph names reach the page as data: the navigation's icons come from
`design/app/nav.json`, and components take names through props. A subset would draw any name
left out as its word in letters, and no static scan can find every name. So the whole font
ships. It is 3.1 MB, fetched once and then cached as an immutable asset.

## Licences

These files are not covered by the repository's own `LICENSE`. Each licence ships beside them:

- `OFL-Inter.txt`: SIL Open Font License 1.1, The Inter Project Authors.
- `OFL-Archivo.txt`: SIL Open Font License 1.1, The Archivo Project Authors.
- `LICENSE-MaterialSymbols.txt`: Apache License 2.0, Google.

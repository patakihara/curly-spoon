# Fonts in res/font

The licences for the TTFs in `../res/font`, which holds font files only. `SonoraFonts.kt` and
`SonoraIcon.kt` read them. `scripts/fonts/fetch.mjs` fetched them once, by hand.

| File                           | Family                   | Bytes     | Source                                                        |
| ------------------------------ | ------------------------ | --------- | ------------------------------------------------------------- |
| `inter.ttf`                    | Inter                    | 876,576   | google/fonts, `ofl/inter/Inter[opsz,wght].ttf`                |
| `archivo.ttf`                  | Archivo                  | 658,596   | google/fonts, `ofl/archivo/Archivo[wdth,wght].ttf`            |
| `material_symbols_rounded.ttf` | Material Symbols Rounded | 8,547,904 | web's `material-symbols-rounded.woff2`, decompressed to TTF   |

The icon font is the web one, whole, so both platforms draw the same glyphs; web/src/fonts/README.md
says why it is not subset.

- `OFL-Inter.txt`: SIL Open Font License 1.1, The Inter Project Authors.
- `OFL-Archivo.txt`: SIL Open Font License 1.1, The Archivo Project Authors.
- `LICENSE-MaterialSymbols.txt`: Apache License 2.0, Google.

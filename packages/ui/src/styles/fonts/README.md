# Vendored fonts

Four woff2 files, self-hosted so this app makes **no request to Google's CDN**. The product is
one container on one port and is meant to work offline or LAN-only; a CDN import means the type
falls back to a system font the moment the network path to Google is unavailable. See
`../fonts.css` for the `@font-face` rules and `docs/design/SONORA.md` for where the two families
come from in the Sonora design system.

| File                          | Family      | Subset    | Bytes  |
| ----------------------------- | ----------- | --------- | ------ |
| `inter-latin.woff2`           | Inter       | latin     | 48,256 |
| `inter-latin-ext.woff2`       | Inter       | latin-ext | 85,068 |
| `roboto-flex-latin.woff2`     | Roboto Flex | latin     | 84,304 |
| `roboto-flex-latin-ext.woff2` | Roboto Flex | latin-ext | 59,020 |

Both families are **variable** fonts, declared with a `font-weight: 400 900` range. Declaring a
single weight instead would make every other weight render synthesized rather than using the real
axis — and Sonora's headings are weight 900, so that would be visible and hard to attribute.
`roboto-flex-latin.woff2` additionally carries the optical-size axis (`opsz 8..144`); the smaller
34,320-byte file Google serves for a weight-only query does not, so the query string used to fetch
these matters and is recorded in `../fonts.css`.

Each file is byte-identical (verified by md5) to what Google Fonts serves for the query in
`../fonts.css`. To refresh them, re-fetch with a **browser** User-Agent — a non-browser UA is
served ttf rather than woff2.

## Licensing

Both families are licensed under the **SIL Open Font License 1.1**, whose terms travel with
redistribution, and this repository is public. The full text ships beside the binaries:

- `OFL-Inter.txt` — Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)
- `OFL-RobotoFlex.txt` — Copyright 2017 The Roboto Flex Project Authors (https://github.com/TypeNetwork/Roboto-Flex)

The repository's own root `LICENSE` is CC0 and covers this project's code; it does not cover these
files and is not a substitute for the above.

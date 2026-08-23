repo: patakihara/curly-spoon
branch: main
path: packages/ui/src/styles, apps/android/app/src/main/java/net/develivarr/auralis/ui/theme

## Last sync
date: 2026-08-20T01:20:00Z
commit: e79325b0a55f

### Updated in this project
- Read the vendored Sonora token copy (web `sonora-tokens.css`/`sonora-theme.css`, Android `Color.kt`) to shape the export format.
- Added `export/` — generated web CSS, Compose `SonoraTokens.kt`, and component prop tables.
- Recorded value drift and the components added since vendoring in `export/DRIFT.md`.

## Screen map

| screen / artifact | built from |
| --- | --- |
| export/web/sonora-tokens.css, export/web/sonora-theme.css | packages/ui/src/styles/sonora-tokens.css, packages/ui/src/styles/sonora-theme.css (format reference) |
| export/android/SonoraTokens.kt | apps/android/app/src/main/java/net/develivarr/auralis/ui/theme/Color.kt (idiom reference) |
| export/DRIFT.md | all three of the above |

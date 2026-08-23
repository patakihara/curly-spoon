# Mobile UI kit (light + dark)

Click-through recreation of the Android-style player. `index.html` renders the same app twice, side by side: one phone in the default dark scope, one inside `data-theme="light"`. Nothing sniffs the OS or browser setting.

Screens: **For You** (search/settings top bar, quick-action tiles, "Not Recently Played" carousel), **Music** (responsive 2-up album grid), **Album detail**, **Now Playing** (full-screen sheet with progress slider, mm:ss timings and transport row), **Queue** (sheet reached from Now Playing's queue button — Now playing / Next up, same sections as the desktop queue panel), plus the persistent pill mini-player and 5-item bottom tab bar (For you / Music / Books / Podcasts / Search).

Composes Card, IconButton, Slider and BottomNav from `components/`; icons are real Material Symbols Rounded glyphs. Surfaces use the same `--surface-*` tokens as the desktop kit, so both platforms read as one product.

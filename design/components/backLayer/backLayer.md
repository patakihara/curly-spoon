# backLayer

The backdrop's control surface behind the front layer: header, actions, its controls rows (shown concealed too) and its panel (shown only revealed; it scrolls when taller than the room above the front layer's header, and holds an open More alone). Takes the deck's palette. Tapping it anywhere that isn't another interactive element toggles it (expand ⇄ conceal); no hover or press feedback — the motion is the feedback. Its header can slide away while the front layer scrolls (hideOnScroll).

Drawn from its node: `regions` (the node's value, Layout.regions) places the header, controls, actions and panel regions; `scroll` is its panel's scroll (the engine's panel surface), sent while the panel scrolls; the panel reports its height for layout. Controls rows are hired as controlsRow (panelRow, place controls), panel rows as paramControlRow.

A surface (extends `surface`): tappable through the inherited `press` event, which replaces its own `tap`.

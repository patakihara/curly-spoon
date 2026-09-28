# design/app

The Auralis canvas: `nav.json`, `shell.json` and one page per screen, built from Sonora's
components.

Every page sits in the app shell, Sonora's backdrop. A page's root is `BackdropShell`, giving only
what is its own: the back layer's `controls` and `trailing` (`back={<BackLayer … />}`), the front
layer's `subheader`, and its content as children. The shell adds the rest from `nav.json` and
`shell.json`: the heading, what leads it (the account avatar on a phone's destination home, a close
control on a page that closes), the bottom bar or rail per layout, the mini-player and the Now
Playing panel.

A page binds `data.…`, its placeholder, and may bind `shell.…` for what it shows from `nav.json`:
a page's `filter` there, its `all` choice and then the destinations it narrows to, labelled as the
destinations are, is `shell.filters.<page id>`, so the filter cannot drift from them.

Placeholder art is `/art/<file>` from `web/public/art`. The canvas build ships each file an
artboard shows under `project/art/` and points the artboard at it by relative path.

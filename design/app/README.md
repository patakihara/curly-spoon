# design/app

The Auralis canvas: `nav.json`, `shell.json` and one page per screen, built from Sonora's
components.

Every page sits in the app shell, Sonora's backdrop. A page's root is `BackdropShell`, giving only
what is its own: the back layer's `controls` and `trailing` (`back={<BackLayer … />}`), the front
layer's `subheader`, and its content as children. The shell adds the rest from `nav.json` and
`shell.json`: the heading, what leads it (the account avatar on a phone's destination home, a close
control on a page that closes), the bottom bar or rail per layout, the mini-player and the Now
Playing panel.

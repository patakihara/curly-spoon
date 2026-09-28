# design/app

The Auralis canvas: `nav.json`, `shell.json` and one page per screen, built from Sonora's
components.

Every page sits in the app shell, Sonora's backdrop. A page's root is `BackdropShell`, giving only
what is its own: the back layer's `controls` and `trailing` (`back={<BackLayer … />}`), and its
`search`, the placeholder of a local search scoped to the page; the front layer's `subheader`; and
its content as children. The shell adds the rest from `nav.json` and `shell.json`: the heading,
the page's `title` there unless the page binds its own from its data (`title={data.title}` on its
`BackLayer`, as an album does, its header then leaving the name out; a shelf binds its subject
there with `eyebrow`, `image` and `round`, the heading's context form, and has no header of its
own), what leads it (the account avatar on a phone's destination home, a
close control on a page that closes), the bottom bar or rail per layout, the mini-player and the
Now Playing panel.

The player's sheets, Now Playing, Queue and Lyrics, are the tabs of Sonora's `NowPlaying`: each
page is its tab's content alone, never a backdrop, and the shell puts it in the player, open on its
tab and showing what shell.json's `playing` loads. Under the side panel's width that is a
full-screen sheet over everything, the bottom bar included; from it, the side panel beside
shell.json's `sheetOver` page, the full-width player bar under the window carrying the transport.
Every page's side panel shows the Now Playing page, the same on each, so that page binds only
`shell.…`: what is loaded, its sleep timer and its about card are shell.json's `playing`.

A handler prop may open another page: `onClick={<Open page="album" ref={release.ref} />}` names a
page of `nav.json` that the page's structure `links` list, or its own page for another item of
its kind, and binds each of its route's parameters
to a data path. A list of several kinds binds the page instead, `<Open page={item.page} ref={item.ref} />`,
and every page its data names must be one of those; the check refuses anything else. `onPlay={<Play ref={episode.ref} queue="spoken" />}`
plays the item its ref binds on the queue it names, spoken or music, `next` makes it Play next,
and `source` plays a list on its own, leaving the queue as it is;
until the player exists, the web gives it a handler that does nothing. The web page navigates to the route through the
router; the Android generator reads the same node as a navigation to the nav graph's destination.

A page binds `data.…`, its placeholder, and may bind `shell.…` for what it shows from `nav.json`:
a page's `filter` there, its `all` choice and then the destinations it narrows to, labelled as the
destinations are, is `shell.filters.<page id>`, so the filter cannot drift from them.

Placeholder art is `/art/<file>` from `web/public/art`. The canvas build ships each file an
artboard shows under `project/art/` and points the artboard at it by relative path.

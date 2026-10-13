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
Now Playing panel. A local search comes out as the front layer scrolls, so on the canvas a page
with one gets a third artboard, a phone with it out (`phone-search`). A page's menus start closed
in the apps, opening from their button and closing on the scrim or an item; a page never draws
one `open`, and the check refuses it. On the canvas a page with a menu gets another phone
artboard with its first menu open (`phone-menu`). A player sheet gets a 1024 px artboard
(`tablet`), the side panel the mini-player's track block opens there, beside the page under it, and
its comparison a 1024 px render, `canvas-tablet.png`.

On desktop the rail lights, for a page that is not a destination, the destination its `lights`
names; with none, Settings for the page at the rail's foot, or else what lights the page that opens
it, the first in `nav.json` whose structure `links` name it, as Shelf review lights Settings. A
page nothing opens lights Browse, where it closes to.

A `bare` page is a screen before the app is yours: signing in, and first-run setup. It lights and
closes to nothing, is no destination and never at the rail's foot, and the shell gives it only its
heading: no rail, bottom bar, player, panel or account. It sits in `BackdropShell`'s `column`, one
centred column at the form's reading width, its heading starting at the page margin as its content
does, so its `PageBody` is `width="form"`. The checks refuse any other use of it.

The player's sheets, Now Playing, Queue and Lyrics, are the tabs of Sonora's `NowPlaying`: each
page is its tab's content alone, never a backdrop, and the shell puts it in the player, open on its
tab and showing what shell.json's `playing` loads. Under the side panel's width that is a
full-screen sheet over everything, the bottom bar included; from it, the side panel over
shell.json's `sheetOver` page, the full-width player bar under the window carrying the transport.
A layout's `sidePanelSits` says where: `beside` the page, or `over` it as a modal side sheet, its
scrim behind it, where the page beside it would be too narrow (600 to 1023 px).
Every page's side panel shows the Now Playing page, the same on each, so that page binds only
`shell.…`: what is loaded, its sleep timer and its about card are shell.json's `playing`.

A handler prop may open another page: `onClick={<Open page="album" ref={release.ref} />}` names a
page of `nav.json` that the page's structure `links` list, or its own page for another item of
its kind, and binds each of its route's parameters
to a data path. A list of several kinds binds the page instead, `<Open page={item.page} ref={item.ref} />`,
and every page its data names must be one of those; the check refuses anything else. An Open
naming its page may also bind any of the query names its route declares, or leave them out:
`<Open page="search" q={s.query} />` for nav.json's `/search?q`. The web navigates to the route
with them as its search string, `/search?q=salt+road`, and Android passes them as the typed
route's arguments; a page bound from data takes its route's parameters alone, and the check
refuses a name the route doesn't declare. `onPlay={<Play ref={episode.ref} queue="spoken" />}`
plays the item its ref binds on the queue it names, spoken or music, or on the one each item's
data names, `queue={item.queue}`, which the check holds to those two; `next` makes it Play next,
and `source` plays a list on its own, leaving the queue as it is;
the web plays it through its player, `usePlay()` in `web/src/player`, and Android through the
`onPlay` it is given. What is loaded, shell.json's `playing`, is the web player's `usePlaying()`:
the mini-player draws only once something is loaded, and its transport and Now Playing's are the
player's own on the web; Android's wait for M5.player.
Two things the canvas draws only one way follow the data in the web app. A header's play button
labelled `Resume` beside the item's bound `progress` says Resume only while there is some, and
Play on an item not begun. A page whose subheader's section bar binds its titles from the data
(`<FrontLayerHeader spy sections={data.sections} />`) draws each titled `Section` the bar's
placeholder names only while the data names it too, so the data can leave out a section it has
nothing for; a section the bar never names always draws.

`onRequest={<Request ref={book.ref} />}` asks for an item the library lacks; no request endpoint
exists yet, so both apps leave it unbound and the card draws its Request disabled. A generated
page never binds a handler that does nothing: a control that seems to work must work. The web
page navigates to the route through the router; the Android generator reads the same node as a
navigation to the nav graph's destination.

`onClick={<SignIn />}` starts signing in through the household sign-on and takes nothing: the web
goes to the server's login route as the web client, coming back to the sign-in page's own
`return_to`, where the visitor was going, or else to the app's start, and Android
calls the `onSignIn()` it is given, the app's own sign-in.

`onChange={<Query />}` and `onSubmit={<Query />}` give a search field the search query, and take
nothing: the field types the draft, and submitting runs the search; the check refuses a Query on
any other prop. The web binds them to `useQuery()`'s `type` and `submit` from `web/src/query`,
drawing a back layer or subheader that holds one as a component of its own, since the shell draws
those outside the page. Android has no search draft until M5.searchui, so it leaves the field
unbound and it draws disabled. On the canvas every handler does nothing.

A page binds `data.…`, its placeholder, and may bind `shell.…` for what it shows from `nav.json`:
a page's `filter` there, its `all` choice and then the destinations it narrows to, labelled as the
destinations are, is `shell.filters.<page id>`, so the filter cannot drift from them.

Placeholder art is `/art/<file>` from `web/public/art`. The canvas build ships each file an
artboard shows under `project/art/` and points the artboard at it by relative path.

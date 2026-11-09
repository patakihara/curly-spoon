---
page: search
pageHash: 004dfdf3ef1f410bc5229b045254c4f19f7550909f1f5c6657a1f27452b8b246
sonora: [kit:desktop/search, kit:mobile/search]
spotify: [S03, S04, S32]
---

# Search

Canvas renders: `search/canvas-phone.png` (390 px) and `search/canvas-desktop.png` (1440 px), both
in the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-desktop-search.png` and `sonora/kit-mobile-search.png`. Also looked at: the page
scrolled to its end on both widths, the Result Rows card, M2's backdrop page
(m2.material.io/components/backdrop, read with Playwright), and Spotify's S03, S04 and S32.

While music plays, a song the household holds shows Play next at the row's end, as a streamed song
does: `ResultRow`'s `nextLabel` and `onNext`, drawn only while it has a label (Salt Water on the
canvas); other pages' rows give no label, so they draw as before.

## What the Sonora UI kit renders show

- **Mobile kit.** The account avatar, a filled `SearchField` ("What do you want to listen to?")
  with its clear control and a settings button in the app bar, then a "RESULTS" label and four
  `ResultRow`s, each with a status pill: "In library" (violet), "87%" (with a ring over the art),
  "Queued", "Failed". No filters, no sections.
- **Desktop kit.** The same field centred in the app bar over the old content pane, five rows with
  "In library", "Requested · 87%", "Queued", "Searching…" and "Failed", and the Player panel.
- **Spotify.** S03/S04: the heading, then a white field pinned while category tiles scroll. S32:
  the query in the bar, type pills overflowing to the right, flat rows with a menu and an add
  control, and seven releases of one song folded behind "More releases · Show all".
- **M2 backdrop.** Back-layer content can filter the front layer; revealed, the back layer shows
  its controls and the front layer slides down, its subheader still naming what it holds ("See 64
  results"); concealed, the back layer gives context. It is revealed by tapping any input field on
  it and concealed by tapping the front layer or a conceal affordance on either layer.

## What the canvas page draws

The back layer, revealed, as M2 puts filters: the heading "Search" (led by the account avatar on
the phone), then as its controls a one-column `LayoutGrid` capped at the list width holding the
`SearchField` with the query "salt" and `autoFocus` (the field has focus; the keyboard is implied,
since Sonora has no keyboard), and the kind filter `ButtonGroup` (All, Songs, Albums, Artists, Books,
Authors, Series, Podcasts, Episodes; All selected), the one filter row. On the phone the kind row runs off the edge behind
ButtonGroup's edge fade, as S32's pills do. The front layer's subheader is a `SortFilterBar`
naming the active filters, "All kinds", with an `expand_less` glyph: tapping it
conceals the back layer. Then, in `PageBody` at the list width:

- **Top result**: one `ResultRow`, the album Salt and Static, whatever its type.
- **In your library**: two songs and a book, each a plain row with no status and no request
  action. One song, Tears of Ice, was found by a remembered line of its lyrics, and its row shows
  that line: "Song · Deep Inertia · “salt on my tongue, ice in my hands”".

The top result, drawn only when the library matched, and each row in your library open their item on a tap, a song its album, and play
it from the art's action on the item's own queue, spoken or music. On the canvas the art shows
that action, always on the phone and on hover on desktop. These renders come from the web app on a
server nobody can sign in to, where the placeholder refs name no playable item, so the rows draw
enabled and their art without the action. The field types the search and submitting it runs the
search; here it draws disabled, as the web serves no search draft yet.

- **Not in your library**: songs that
  play from YouTube Music, an `ExpanderRow` "More releases of Salt", a book already requested
  (ring on the art, "Downloading · 42%" in the progress tone and nothing else at its end; on the
  phone the pill keeps "42%"), a book a request brought, "In library" in the library tone, its art playing it, a book with
  "Request", and a podcast with "Subscribe".

**Suggestions** are the page's `suggest` state, while typing before results come in, drawn under
`<When state="suggest">`; the results above are its `full` state. The canvas draws them on their
own phone artboard, `search.phone-suggest`; these renders, from the web app, draw `full` only
until its data code passes the state. As you type, the front layer holds one untitled section
under the focused field, a `ResultRow` per suggestion: titles, creators and series you have, plus
recent searches, each naming its kind in its meta ("Album · Soul Vertex", "Recent") and led by a
glyph in place of art (ResultRow `icon`: `search`, or `history` for a recent search), so a
suggestion never looks like an item with a cover. Choosing one opens Search with its text as the
query, running the search, and the results replace them.

**Concealed state**: the back layer shrinks to the heading and the field; the results' header
still names the active filters, now with `expand_more`, and tapping it from any scroll position
slides the results down to show the kind row again.

**Empty states**, per nav.json: with no query, the front layer lists recent searches (the
`suggest` state, asked with nothing typed). A search that finds nothing is the page's `empty`
state, under `<When state="empty">`: in place of the three sections, one Sonora `EmptyState` with
a `search_off` glyph, "Nothing found" and "Nothing in your library matches this search.". A search
the server did not answer is its `failed` state, under `<When state="failed">`: the same
`EmptyState` with a `cloud_off` glyph, "Search failed" and "The server did not answer this
search.". Both write their words in the page, as Not Found and Sign In do, so the data only
chooses the state. The canvas draws each on its own phone artboard, `search.phone-empty` and
`search.phone-failed`, as it does `suggest`; these renders draw `full` only.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: filters live in the back layer, revealed in this still, as M2 and the plan
  put them; neither kit has filters, and Spotify's pills sit in the page.
- Changed on purpose: results fall into Top result, In your library and Not in your library, where
  the kits show one flat "Results" list; the plan asks for the top result first, then the two
  sections.
- Changed on purpose: owned rows carry no pill at all, where the kits mark them "In library";
  the section heading already says so, and an owned result offers nothing to request.
- Changed on purpose: outside books and podcasts carry a Request or Subscribe button at the
  row's end (ResultRow `trailing`, as in S32), and a requested book shows its live status; the
  kits show status pills only.
- Changed on purpose: the kits' app-bar field moves into the back layer under the heading, as
  S03 lays it out; the kit's settings button is gone (Settings sits at the rail's foot or behind
  the avatar).
- Changed on purpose: rows on the phone keep only the percentage of a status ("42%"), as the
  mobile kit's "87%" does, now Sonora's rule for a phone's ResultRow.
- Open: the top result is an ordinary row; Spotify gives it a large card, and Sonora has no
  top-result card yet.
- Open: the revealed back layer takes about 210 px on the phone and 240 px on desktop, so the
  outside rows with Request and Subscribe sit below the fold in both stills (looked at scrolled);
  concealing it gives the results the screen.
- Open: suggestions and the empty and failed states are drawn on the canvas's `phone-suggest`,
  `phone-empty` and `phone-failed` artboards but not in these renders, which show the `full` state
  only (see above).
- Changed on purpose: neither kit nor Spotify's stills show a search that finds nothing or fails;
  the page uses Sonora's `EmptyState`, as Not Found does, so it states the fact and names no way
  on. A failed search is asked again by pressing Enter on it.
- Changed on purpose: rows in your library open on a tap and play from their art, where the kits
  show no handlers. ResultRow draws its art action only when given one of its own (`onAction`),
  never standing in for the row's tap, so a row that only opens shows no Play.
- Changed on purpose: no library scope and no Lyrics chip: songs match on their lyrics anyway, a song found by a line showing it in its row, and the sections already split your library from outside it.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.

## M3.requests

- Changed on purpose: "Not in your library" opens with what the household has that you have not played, each row opening its page and playing from its art as a library row does: "Salt Roads". The catalogue's rows follow, unbound as before.
- Changed on purpose: a section with nothing in it draws no title, and an expander row with no words is not drawn.
- Changed on purpose: "Your requests" is a row of its own at the head of the page, leading to Requests, drawn while the person has any request, whatever the search shows: results, nothing found, a failed search, or no query yet. The server's answer says whether they have any.

## M3.books

- Changed on purpose: an outside book's button requests that book, `onClick={<Request ref={book.ref} />}`, the first `Request` that is not on a card's `onRequest`. These renders come from the web app, which leaves it unbound until its verbs land, so the button draws disabled as before.
- Changed on purpose: a book your own request brought says "In library" on its row, in the library tone. The kits' pill says the same.
- Changed on purpose: an outside book's meta names who wrote it and its year, and who reads it where known, so one edition tells from another. It names no indexer: which one holds a release is not known until the request searches.
- Changed on purpose: a book's row draws its status or its button, never both, so a title keeps its line on the phone. Each book names its row by three lists (`book.asking`, `book.standing`, `book.arrived`), one of them holding it, so it keeps its place in the list as its request moves. A row on its way or failed taps through to Requests, which says why. One that arrived opens its book and plays it from its art, as a library row does. A tap that did not reach the server keeps its Request button beside "Request failed": no request stands, so the button is the way to try again.
- Changed on purpose: one live request too many says so in a `StatusBanner` over the rows, as Requests says a verb that failed, and the row keeps its Request button, as nothing about that book went wrong. Drawn on this canvas page with its words, as on Requests.
- Changed on purpose: a book someone else has asked for draws as any book you lack, with its Request button, so nothing of another person's request shows. Tapping it joins, and the row then shows its status and it is in your Requests.

## M3.ytmusic

- Changed on purpose: a song from YouTube Music plays from its art, as a library row does, and names no page to open: it belongs to no album here. Its meta line says "Streams" straight after "Song", the subtle mark the plan asks for, where a phone's cut line keeps it.
- Changed on purpose: while music plays a song's own button is "Play next", the plan's default action, at the row's end (ResultRow `trailing`); its art still says Play and plays it now. Each song names its row by two lists (`song.plays`, `song.follows`), one of them holding it, as a book's three do, so the row keeps its place. The canvas draws one of each.
- Changed on purpose: "Streaming unavailable", and a song that cannot play saying why, take the page's one `StatusBanner`, over the rows, as too many requests does. The banner's words are the data's; the canvas draws it with too many requests.

## M3.keep

- Changed on purpose: each song from YouTube Music ends in an `OverflowMenu`, ResultRow's `menu`, drawn last, after Play next where it shows, so adding it moves no button. Its one verb is "Add to library" (`library_add`), the key `keep`, which keeps the song in the household's library; Spotify's S32 rows end in a menu too. These renders come from the web app, which binds no `keep` yet, so the menu draws disabled, as the rows do.
- Changed on purpose: a song being kept shows its keep's status where a book's does, "Importing" in the progress tone, and still plays from its art: it streams until the library holds it. Its menu holds nothing, so it draws disabled. The canvas draws one such row, "Salt of the Sea". The rows sit below the fold in both stills (looked at scrolled, both widths): on the phone the title keeps its line beside "Importing" and the menu.

---
page: search
pageHash: f77af49ab6c9235b1ab9dbdac5a41c21bcce59aef26717b8229fb4f1fc55405d
sonora: [kit:desktop/search, kit:mobile/search]
spotify: [S03, S04, S32]
---

# Search

Canvas renders: `search/canvas-phone.png` (390 px) and `search/canvas-desktop.png` (1440 px), both
in the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-desktop-search.png` and `sonora/kit-mobile-search.png`. Also looked at: the page
scrolled to its end on both widths, the Result Rows card, M2's backdrop page
(m2.material.io/components/backdrop, read with Playwright), and Spotify's S03, S04 and S32.

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

The top result and each row in your library open their item on a tap, a song its album, and play
it from the art's action on the item's own queue, spoken or music. On the canvas the art shows
that action, always on the phone and on hover on desktop. These renders come from the web app on a
server nobody can sign in to, where the placeholder refs name no playable item, so the rows draw
enabled and their art without the action. The field types the search and submitting it runs the
search; here it draws disabled, as the web serves no search draft yet.

- **Not in your library**, with a "Your requests" text action leading to Requests: a song that
  plays from YouTube Music, an `ExpanderRow` "More releases of Salt", a book already requested
  (ring on the art, "Downloading · 42%" in the progress tone, a pressed "Requested" button; on the
  phone the pill keeps "42%"), a book with "Request", and a podcast with "Subscribe".

**Suggestions** are the page's `suggest` state, while typing before results come in, drawn under
`<When state="suggest">`; the results above are its `full` state. The canvas and these renders
draw `full` only. As you type, the front layer holds one untitled section under the focused
field, a `ResultRow` per suggestion: titles, creators and series you have, plus recent searches,
each naming its kind in its meta ("Album · Soul Vertex", "Recent"). Choosing one opens Search with
its text as the query, running the search, and the results replace them.

**Concealed state**: the back layer shrinks to the heading and the field; the results' header
still names the active filters, now with `expand_more`, and tapping it from any scroll position
slides the results down to show the kind row again.

**Empty states**, per nav.json: with no query, the front layer lists recent searches; with no
results, one line says nothing matched, in your library or outside it.

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
- Open: suggestions are drawn on the page but not in these renders, which show the `full` state
  only (see above).
- Changed on purpose: rows in your library open on a tap and play from their art, where the kits
  show no handlers. ResultRow draws its art action only when given one of its own (`onAction`),
  never standing in for the row's tap, so a row that only opens shows no Play.
- Changed on purpose: no library scope and no Lyrics chip: songs match on their lyrics anyway, a song found by a line showing it in its row, and the sections already split your library from outside it.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.

---
page: books
pageHash: 7de2ec8a853b812db103f7e94469d9620ac7c90b50e2d7dadcd9e50e5df4c4ea
sonora: [kit:desktop/books, kit:mobile/books]
spotify: [S31]
---

# Books

Canvas renders: `books/canvas-phone.png` (390 px) and `books/canvas-desktop.png` (1440 px), both in
the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-desktop-books.png` and `sonora/kit-mobile-books.png`. Also looked at: the Media &
Artist Cards and Backdrop Local Search cards, the page scrolled on the phone, and Spotify's S31
(Your Library) for the sort row; S25's notes for intent.

## What the Sonora UI kit renders show

- **Mobile kit.** "Audiobooks" in the app bar with search and settings buttons. The `TabBar`
  Authors, Books, Series, Narrators (Books active, Narrators running off the edge), a list toggle
  at the top right, then a 3-across grid of book covers with rose resume bars on three, a
  "not in library" glyph on two, captions "Book · author".
- **Desktop kit.** The same tabs and toggle in the rail layout, a grid of 190 px covers 3 across,
  "Not in library" pills, resume bars, and the Player panel on the right.

## What the canvas page draws

The back layer holds the heading "Books" ending in the local search's button (`BackLayer
search="Search your books and requests"`: out as the front layer scrolls, as on Music), and no
filter row: requests sit among the books, greyed with their status, as the plan says. The subheader
is the `TabBar` Books, Authors, Series, Narrators, opening on Books, its first tab. The body: the `SortFilterBar` "Title" with the `ViewToggle` opposite, then a `LayoutGrid`
of `MediaCard`s in title order: 3 across on the phone, filling the front layer on desktop. Owned books carry
their rose resume bar (Foggy Trails, The Quiet Lodger, The Long Meridian). Three are requests, their
art greyed and a pill in their tone: "Downloading · 64%" and "Downloading · 18%" in the accent
(the download progress the structure asks for; on a phone card it keeps "64%" with its glyph,
sized to the pill's text by Sonora's `--icon-2xs`) and
"Failed" in the error tone. No book shows "Needs choice": the plan keeps that for album torrents,
and a book's release is picked automatically.

Measured in the browser: the desktop grid starts where the kit's does, at x = 296 with cards 20 px
apart, and runs to the front layer's margin at x = 1091, 4 cards of 184 px across; the phone's first tab now starts at the page margin as the kit's does, after Sonora's
`TabBar` learnt to place itself again once the icon font has loaded.

**Empty state**, per nav.json (not drawn as an artboard): the heading, tabs and sort row
stay; the grid gives way to one line saying there are no books yet, and that books are requested
from Search.

Each book card opens its Book page, and a greyed book not yet requested requests it with a tap, as on
Series; the Authors and Series tabs, not drawn, hold those cards.

## Differences

- Changed on purpose: every Sonora basic control the page binds no action to is drawn disabled,
  its ink at 38% and a filled one's container at 12% (Material's disabled state). Part C of the
  states item binds each such control or leaves it deliberately disabled.
- Matches: tabs, toggle placement, 3-across phone grid, rose resume bars.
- Changed on purpose: on desktop the grid fills the front layer, where the kit's stops at 190 px
  columns and leaves the row's end empty. Sonora's `LayoutGrid` decides the count: as many columns
  as its 160 px minimum allows, sharing the rest, so 4 across at 184 px beside the panel at 1440 px,
  3 at 1240, 4 at 1024, 3 at 600 and 7 at 1920, as the plan's "bigger on desktop" asks.
- Changed on purpose: the heading is "Books" (nav.json's label), not "Audiobooks".
- Changed on purpose: the kit's app-bar search is the back layer's local search, out on scroll.
- Changed on purpose: the tabs run Books, Authors, Series, Narrators and open on Books, the first,
  where the kit leads with Authors: a tab row opens on its first tab.
- Changed on purpose: a sort row ("Title"; the picker holds Title, Author, Random) leads the grid,
  as in S31, where the kit has the toggle alone.
- Changed on purpose: requests carry their status tone on greyed art (`MediaCard.status`), where
  the kit shows "Not in library" on external books; a home shows only what you have and requested.
- Changed on purpose: captions drop the kit's "Book ·" prefix, since the home holds only books.
- Open: the in-library marker is still open in the plan and is not drawn.
- Open: the Downloaded filter is Android's alone and not drawn; the page format has no
  per-platform content yet.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a greyed card is grey, its cover without colour and its title muted, not only darkened.

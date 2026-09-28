---
page: books
pageHash: 45ddfc0590af4c48767132c242a3e817fff45fc0a758c7d64f19a7aeb8b455fd
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
search="Search your books and requests"`: out as the front layer scrolls, as on Music), and as its
controls the filter `ButtonGroup` All, Requested, All selected in the accent. Requests show up in
the library under their own filter, as the plan says. The subheader is the `TabBar` with Books
active. The body: the `SortFilterBar` "Title" with the `ViewToggle` opposite, then a `LayoutGrid`
of `MediaCard`s in title order: 3 across on the phone, 190 px columns on desktop. Owned books carry
their rose resume bar (Foggy Trails, The Silent Patient, Wind and Truth). Three are requests, their
art greyed and a pill in their tone: "Downloading · 64%" in the accent (the download progress the
structure asks for; on a phone card it keeps "64%" with its glyph), "Needs choice" in the request
tone and "Failed" in the error tone.

Measured in the browser: the desktop grid matches the kit's, 190 px cards 20 px apart from
x = 296; the phone's first tab now starts at the page margin as the kit's does, after Sonora's
`TabBar` learnt to place itself again once the icon font has loaded.

**Empty state**, per nav.json (not drawn as an artboard): the heading, filter, tabs and sort row
stay; the grid gives way to one line saying there are no books yet, and that books are requested
from Search.

## Differences

- Matches: tabs, toggle placement, 3-across phone grid, 190 px desktop grid, rose resume bars.
- Changed on purpose: the heading is "Books" (nav.json's label), not "Audiobooks".
- Changed on purpose: the kit's app-bar search is the back layer's local search, out on scroll.
- Changed on purpose: a Requested filter sits in the back layer, as Browse's filter does; the kit
  has none.
- Changed on purpose: a sort row ("Title"; the picker holds Title, Author, Random) leads the grid,
  as in S31, where the kit has the toggle alone.
- Changed on purpose: requests carry their status tone on greyed art (`MediaCard.status`), where
  the kit shows "Not in library" on external books; a home shows only what you have and requested.
- Changed on purpose: captions drop the kit's "Book ·" prefix, since the home holds only books.
- Open: the in-library marker is still open in the plan and is not drawn.
- Open: the Downloaded filter is Android's alone and not drawn; the page format has no
  per-platform content yet.

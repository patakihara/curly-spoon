---
page: author
pageHash: b077bfdb162d8644d5541875aeabb203644a709f5815608a70af39f956e7ec47
sonora: [none]
spotify: []
---

# Author

Canvas renders: `author/canvas-phone.png` (390 px) and `author/canvas-desktop.png` (1440 px),
both in the app shell; a 1440 x 1700 render was also read for the grid below the fold. Sonora has no
author screen and nav.json names no Spotify screen, so there is no UI kit render; looked at instead:
the Sonora kits' album screens (`sonora/kit-*-album.png`), the drawn Artist page this one mirrors,
the Media Header card's round, action-less header and the Media Cards card's "Not in library" and
request states.

## What the sources show

- **Kits' album screens.** `MediaHeader` over a list; `round` exists for a person.
- **The Artist page.** A round header with a caption, then one carousel per group of the catalogue,
  greyed where you don't own it.

## What the canvas page draws

The heading is the author's name, bound from its data, led by the close control. A round
`MediaHeader` with no title and no buttons, only "AUTHOR" and "7 books · 3 in your library": on the
phone centred under the photo, on desktop a caption beside it. Then one `Section` per series,
"Series" over its name, the heading a link to the series' page, and a `Shelf` of its books in
order, "Book 1", "Book 2"…: owned ones with progress, a requested one "Downloading · 30%", the
rest greyed "Not in library". Then "Books", every book in a `LayoutGrid`, the same states, each
card opening its book.

**Empty state**, per nav.json: owning nothing by them shows every book greyed and requestable.

## Differences

- Matches the Artist page: the round photo and a caption under the name as heading, carousels of
  the catalogue with unowned titles greyed.
- Changed on purpose: series come first, each in reading order, then every book in a grid, per
  nav.json; a book in a series shows in both.
- Changed on purpose: no bio or follow; nav.json's header is the photo and the name. The setting
  that hides unowned books is Settings' and not drawn here.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Books' rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a book you don't own is greyed, its cover without colour and its title muted, and a tap on it requests it: the card says Requested (`MediaCard onRequest`, `<Request ref>` in the page), and its page stays a verb, Open, in the card's corner menu. A book you own opens its page.

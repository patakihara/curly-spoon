---
page: series
pageHash: 6d995beec7e45ff7ba7bf3c5adc4aa2f85e7204c2fc9143bf4d1fe3217390a7d
sonora: [none]
spotify: []
---

# Series

Canvas renders: `series/canvas-phone.png` (390 px) and `series/canvas-desktop.png` (1440 px),
both in the app shell; a 1440 x 1100 render was also read. Sonora has no series screen and nav.json
names no Spotify screen, so there is no UI kit render; looked at instead: the Sonora kits' album
screens (`sonora/kit-*-album.png`), the Media Cards card's eyebrow, progress, "Not in library" and
request states, and the drawn Shelf page's grid.

## What the sources show

- **Kits' album screens.** `MediaHeader` with the art beside or above a kind line, a link and meta.
- **Media Cards card.** An eyebrow over the title, a progress bar across the art, a dashed "Not in
  library" card and a request pill.

## What the canvas page draws

The heading is the series' name, bound from its data, led by the close control. A `MediaHeader`
with the first book's cover, "SERIES", the author as an accent link to their page and "4 books ·
48 h 10 m · 2 in your library", no title and no buttons. Then the books in series order in a
`LayoutGrid` of `MediaCard`s, each with "Book 1"… as its eyebrow and its length: the first
finished, the second part-read with its progress, the third greyed "Not in library", the fourth
"Downloading · 30%"; a tap on the third requests it, the others open their book.

**Empty state**, per nav.json: a series you own none of shows every book greyed and requestable.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Matches the kits' detail header: art, kind line, the author as an accent link, meta.
- Changed on purpose: the books are a grid of covers with their number as the eyebrow, not rows,
  so greyed and requested books read the same as on Books and Author.
- Changed on purpose: no play buttons; a series is resumed from its book, and nav.json's header is
  the name, count and length. The author link is added because nav.json links the series to its
  author.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Books' rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a book you don't own is greyed, its cover without colour and its title muted, and a tap on it requests it: the card says Requested (`MediaCard onRequest`, `<Request ref>` in the page), and its page stays a verb, Open, in the card's corner menu. A book you own opens its page.

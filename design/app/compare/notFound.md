---
page: notFound
pageHash: f0ef4e6823157c232fda493f1777fb30289f1299cedb1d77ae76e3b8c415e683
sonora: [none]
---

# Not found

Canvas renders: `notFound/canvas-phone.png` (390 px) and `notFound/canvas-desktop.png` (1440 px),
both in the app shell. No Sonora UI kit screen exists for it (nav.json names `none`); the page is
compared with the Empty State card, which Sonora gained for this page.

## What Sonora shows

- **Empty State card.** A muted `link_off` glyph in a card-tone circle, the fact as a heading,
  one line more and a secondary "Go to Browse" button, centred in a form-width column, on
  desktop and the phone, dark and light.

## What the canvas page draws

The back layer holds the heading "Not found", led by a close control, which returns to whatever
opened the link. Nothing is lit in the bottom bar; the rail lights Browse, which the page closes to when nothing
opened it. The front layer holds only the
`EmptyState`: "This page doesn't exist", "The link may be old, or what it pointed to has left the
library.", and "Go to Browse". It binds no data; its placeholder is empty.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Matches the Empty State card: glyph, heading, line and button, centred in the front layer.
- Changed on purpose: the close control and "Go to Browse" both lead away; the close returns to
  the opener, as every closing page does, and the button is the way back nav.json names.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Browse lit on the rail.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.

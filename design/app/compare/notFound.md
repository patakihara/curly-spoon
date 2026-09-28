---
page: notFound
pageHash: d1e819d6ddb69ea94d93e9ad63f74d289d96bc31c23e4bc1b44ccb816bbe0323
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
opened the link. Nothing is lit in the bottom bar or the rail. The front layer holds only the
`EmptyState`: "This page doesn't exist", "The link may be old, or what it pointed to has left the
library.", and "Go to Browse". It binds no data; its placeholder is empty.

## Differences

- Matches the Empty State card: glyph, heading, line and button, centred in the front layer.
- Changed on purpose: the close control and "Go to Browse" both lead away; the close returns to
  the opener, as every closing page does, and the button is the way back nav.json names.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, no rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.

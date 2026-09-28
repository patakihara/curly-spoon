---
page: notFound
pageHash: b4a6d7d1078b1727a72144c405f67d2e66222bd30787f89e89d29337c754984d
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

---
page: signIn
pageHash: 3426a49b67b53870fd9e4e35870f29f0a1a69521857737b922650ec5d84252d1
sonora: [none]
---

# Sign in

Canvas renders: `signIn/canvas-phone.png` (390 px) and `signIn/canvas-desktop.png` (1440 px). No
Sonora UI kit screen exists for Sign in (nav.json names `none`); the page is compared with the
Empty State card (a glyph in a circle, the fact as a heading, one line and one button, centred)
and the Browse, Status & Disclosure card (`StatusBanner`'s error tone with a text action).

## What the canvas page draws

A bare page, as Setup is: the heading "Sign in" as a top app bar on the phone and over the front
layer on desktop, no navigation, player or account, no close control. In `PageBody` at the form
width:

- **Error**: an error `StatusBanner`, "That account isn't one of the household's, so Auralis can't
  let it in. Whoever runs the server can add it.", with "Try again". The render shows the page as
  it comes back from a refused sign-in; a first visit has no banner.
- **Sign in**: an `EmptyState` with the people glyph, "Sign in with your household account", the
  line "Auralis has no accounts or passwords of its own: you sign in where you sign in to
  Audiobookshelf and Jellyfin.", and one primary "Sign in" button, to the household sign-on.

**Empty state**, per nav.json (not drawn): someone already signed in goes straight on.

## Differences

- Changed on purpose: `EmptyState` carries the sign-in, since its shape (glyph, heading, one line,
  one way on) is the whole page; no other Sonora component centres a single call to act.
- Changed on purpose: the banner sits inside the form column, where the card's banners run the
  full width of their panel; Sonora's banner now keeps to the column it is given.
- Open: the error and the first visit are one render until the placeholders gain states in
  M2.screens.
- Open: on the phone the app bar's title sits 12 px from the edge with nothing leading it, where
  the content keeps the 16 px margin.
- Open: on desktop the column sits at the left of a wide empty front layer.

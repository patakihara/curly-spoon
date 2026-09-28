---
page: signIn
pageHash: a4ee484e9b31c679737dba821796ceb7e9326aec04a6af1b8aa85f27e3847a7f
sonora: [none]
---

# Sign in

Canvas renders: `signIn/canvas-phone.png` (390 px) and `signIn/canvas-desktop.png` (1440 px). No
Sonora UI kit screen exists for Sign in (nav.json names `none`); the page is compared with the
Empty State card (a glyph in a circle, the fact as a heading, one line and one button, centred)
and the Browse, Status & Disclosure card (`StatusBanner`'s error tone with a text action).

## What the canvas page draws

A bare page, as Setup is: the heading "Sign in" as a top app bar on the phone and over the front
layer on desktop, no navigation, player or account, no close control. Heading and content share
one centred column (`BackdropShell column`), the heading starting at the page margin as the
content does. In `PageBody` at the form width, in the structure's order:

- **Sign in**: an `EmptyState` with the people glyph, "Sign in with your household account", the
  line "Auralis has no accounts or passwords of its own: you sign in where you sign in to
  Audiobookshelf and Jellyfin.", and one primary "Sign in" button, to the household sign-on.
- **Error**: an error `StatusBanner`, "That account isn't one of the household's, so Auralis can't
  let it in. Whoever runs the server can add it.", with "Try again". The render shows the page as
  it comes back from a refused sign-in; a first visit has no banner.

**Empty state**, per nav.json (not drawn): someone already signed in goes straight on.

## Differences

- Changed on purpose: `EmptyState` carries the sign-in, since its shape (glyph, heading, one line,
  one way on) is the whole page; no other Sonora component centres a single call to act.
- Changed on purpose: the banner sits inside the form column, where the card's banners run the
  full width of their panel; Sonora's banner now keeps to the column it is given.
- Open: the error and the first visit are one render until the placeholders gain states in
  M2.screens.
- Changed on purpose: with nothing beside it, the page sits in one centred column on desktop,
  Sonora's `BackdropShell column`, and its heading starts at the page margin on both platforms,
  16 px on the phone, level with the content.
- Changed on purpose: the banner follows the button, as the structure orders Sign in before
  Error, where the card puts a banner at the top of its panel.

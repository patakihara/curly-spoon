---
page: browse
pageHash: 59935a28939562e24177bc0af8c395e5e5d64bfa929c41767830eed07b17513f
sonora: [kit:mobile/browse, kit:desktop/browse]
---

# Browse

Canvas renders: `browse/canvas-phone.png` (390 px), `browse/canvas-desktop.png` (1440 px).
Sonora UI kit renders, the design this page is compared against: `sonora/kit-mobile-browse.png`
(the mobile kit on its first screen, All filter) and `sonora/kit-desktop-browse.png` (the desktop
kit's Browse destination). No Spotify screen was needed for intent: the kits cover the feed.

## What the Sonora UI kit renders show

- **Mobile kit.** Title "Browse" in the app bar, then a connected `ButtonGroup` of filters
  (All, Music, Audiobooks, Podcasts), All in the accent. "Jump back in": a 2-up grid of
  `QuickPick` tiles, art on the left, title and a "Book · 6 h 12 m left" line. "Recently
  added": a `Shelf` of large `MediaCard`s, one with a progress bar, bleeding off the right edge,
  with an arrow action. "Artists & authors": a shelf of round `ArtistCard`s. Below the fold,
  "Picked for you" (small cards) and "Recently played" (`ResultRow`s). The mini-player and the
  bottom nav belong to the shell.
- **Desktop kit.** The same feed at desktop density: the title in the app bar, the filters in
  the front layer's subheader, "Jump back in" as two columns of wide quick picks capped at the
  tile width, "Recently added", "Picked for you" and "Artists & authors" shelves with arrow
  actions. The nav rail is on the left and the Now Playing panel on the right.

## What the canvas page draws

`PageBody`, the filter `ButtonGroup`, "Jump back in" as 2-up `QuickPick`s, then the
"Recently added", "Artists & authors" and "Picked for you" shelves and the "Recently played"
rows, in the mobile kit's order and with its titles and art.

## Differences

- Fixed: the first draw added a wide episode `FeatureCard` and a "More like" shelf taken from
  Spotify's Home screens, and left out the kit's "Picked for you" and "Recently played". The
  kits are the design, so the feed now follows the mobile kit, section for section.
- Fixed: the filter row sat flush against "Jump back in". It is now an untitled `Section`,
  which carries the feed's gap, as the kit's subheader spacing does.
- Fixed: at 390 px "Jump back in" fell to one column, where the mobile kit (412 px) shows
  2-up. `columns={2}` now holds it, which matches the desktop kit's two columns too.
- Fixed: on desktop the quick picks ran the full width; they are capped at
  `--grid-max-width-tiles`, as the desktop kit caps them.
- Fixed, by adding to Sonora: the kits pad each screen with a hand-styled `div`, which a page
  may not do. Sonora gained `PageBody` (page margin, feed top gap, reading width), which the
  `Shelf` bleed already assumes.
- Open: one page serves both kits, so desktop shows "Artists & authors" before "Picked for
  you" and keeps "Recently played", where the desktop kit swaps the two and ends there.
- Open: every "Recently played" row draws its divider; the kit drops the last one, which the
  page format cannot express yet.
- Shell, part 2: no "Browse" title, app bar, nav rail or bottom nav, mini-player or Now Playing
  panel, which both kits draw around the feed.

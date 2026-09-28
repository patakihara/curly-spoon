---
page: browse
pageHash: ced725d84439ea7bca11192e607be15041a9f4b7fd63ee313358b4c411618f70
sonora: [kit:mobile/browse, kit:desktop/browse]
---

# Browse

Canvas renders: `browse/canvas-phone.png` (390 px), `browse/canvas-desktop.png` (1440 px).
Sonora UI kit renders, the design this page is compared against: `sonora/kit-mobile-browse.png`
(the mobile kit on its first screen, All filter) and `sonora/kit-desktop-browse.png` (the desktop
kit's Browse destination). No Spotify screen was needed for intent: the kits cover the feed.

## What the Sonora UI kit renders show

- **Mobile kit.** The account avatar, then the title "Browse", in the app bar, then a connected
  `ButtonGroup` of filters (All, Music, Audiobooks, Podcasts), All in the play rose with black ink. "Jump back in": a 2-up grid of
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

`PageBody`, the filter `ButtonGroup`, "Jump back in" as an auto-filled grid of wide
`QuickPick`s, then the "Recently added", "Artists & authors" and "Picked for you" shelves and
the "Recently played" rows, in the mobile kit's order and with its titles and art.

Measured in the browser (`getBoundingClientRect`), kit against page: page margin 16 px against
16 px on the phone and 28 px against 28 px on desktop; the phone's "Recently added" shelf runs
to the right edge in both (0 px short); desktop quick picks 300 px wide against 300 px, 10 px
apart across and down against 10 px; phone quick picks 2-up, 8 px apart in both (186 px wide
in the 412 px kit phone, 175 px at 390 px).

## Differences

- Matches, after the one-accent change: the filter's selected segment is the play rose with
  black ink, and the resume bars on "Recently added" cards are rose, in both kits and on the
  page (`ButtonGroup tone="play"`). The desktop kit's player panel keeps its "Now playing" tab
  in the violet accent, since tabs are not play-related; that panel is part 2's.
- Fixed: the first draw added a wide episode `FeatureCard` and a "More like" shelf taken from
  Spotify's Home screens, and left out the kit's "Picked for you" and "Recently played". The
  kits are the design, so the feed now follows the mobile kit, section for section.
- Fixed: the filter row sat flush against "Jump back in". It is now an untitled `Section`,
  which carries the feed's gap, as the kit's subheader spacing does.
- Fixed: the page sat 8 px further in on every side (24 px on the phone, 36 px on desktop),
  the browser's own body margin, and the phone's shelves stopped 8 px short of the right
  edge. The web app's base styles now reset it, as the kits' pages do.
- Fixed: on desktop the quick picks were 490 px wide and 20 px apart, from a fixed
  `columns={2}`. The page now lets `LayoutGrid` auto-fill wide items as both kits do, capped at
  `--grid-max-width-tiles`, and Sonora's `LayoutGrid` now spaces wide items half a gutter apart
  on desktop by default (10 px), the gap the desktop kit passes by hand.
- Open: with no shell, the desktop page fills the whole 1440 px window, so three quick picks
  fit across where the kit's narrower pane, between the rail and the player panel, fits two.
  The tiles themselves match; the shell (part 2) brings the pane.
- Fixed, by adding to Sonora: the kits pad each screen with a hand-styled `div`, which a page
  may not do. Sonora gained `PageBody` (page margin, feed top gap, reading width), which the
  `Shelf` bleed already assumes.
- Open: one page serves both kits, so desktop shows "Artists & authors" before "Picked for
  you" and keeps "Recently played", where the desktop kit swaps the two and ends there.
- Open: every "Recently played" row draws its divider; the kit drops the last one, which the
  page format cannot express yet.
- Shell, part 2: no account avatar, "Browse" title, app bar, nav rail or bottom nav, mini-player or Now Playing
  panel, which both kits draw around the feed.

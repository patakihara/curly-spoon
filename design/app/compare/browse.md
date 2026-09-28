---
page: browse
pageHash: e7461debe78bbab17d880c4d1515b52bee85ceee02b8bf33257df2c855af7451
sonora: [kit:mobile/browse, kit:desktop/browse]
---

# Browse

Canvas renders: `browse/canvas-phone.png` (390 px, the bottom bar's layout) and
`browse/canvas-desktop.png` (1440 px, the labelled rail with the Now Playing panel), both in the
app shell. Also compared: Sonora's Backdrop cards (`backdrop-anatomy`, `backdrop-spy-subheader`,
`backdrop-subheader`, `backdrop-side-panel`), the latest mockups of the shell itself.
Sonora UI kit renders, the design this page is compared against: `sonora/kit-mobile-browse.png`
(the mobile kit on its first screen, All filter) and `sonora/kit-desktop-browse.png` (the desktop
kit's Browse destination). No Spotify screen was needed for intent: the kits cover the feed.

## What the Sonora UI kit renders show

- **Mobile kit.** The account avatar, then the title "Browse", in the app bar, then a connected
  `ButtonGroup` of filters (All, Music, Audiobooks, Podcasts), All in the play rose with black
  ink. "Jump back in": a 2-up grid of
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

The page in the app shell, Sonora's backdrop. The back layer holds the heading "Browse", led on the
phone by the account avatar, and the filter `ButtonGroup` as its controls: the filter reconfigures
what the front layer shows, so it sits on the back layer, as in the Backdrop Anatomy card. Its
choices are All, Music, Podcasts, Books: nav.json's filter for Browse, labelled by the destinations
(`shell.filters.browse`), so they cannot drift from them. The front layer has a scroll-spy
`FrontLayerHeader`, which shows only once a section title has scrolled under it and then carries
the title that last passed; at rest there is no band. Under it, `PageBody`: "Jump back in" as an auto-filled grid of wide `QuickPick`s, then
the "Recently added", "Artists & authors" and "Picked for you" shelves and the "Recently played"
rows, in the mobile kit's order and with its titles and art. Around it: the bottom bar and the
mini-player on the phone; on desktop the labelled rail (Search first, Settings at its foot), the
docked transport bar and the Now Playing panel.

Measured in the browser (`getBoundingClientRect`), kit against page: page margin 16 px against
16 px on the phone and 28 px against 28 px on desktop; desktop quick picks 300 px wide against
300 px, 10 px apart against 10 px, now two across in the pane between the rail and the panel, as in
the kit; the labelled rail 268 px wide in both, the panel at `--side-sheet-width` in both.
Scrolled by 600 px at 390, 800, 1100 and 1440 px: the heading, the filters, the rail and the players
stay put, the document never scrolls, and the front layer is the one scroller.

## Differences

- Matches, after the one-accent change: the filter's selected segment is the play rose with
  black ink, and the resume bars on "Recently added" cards are rose, in both kits and on the
  page (`ButtonGroup tone="play"`). The Now Playing panel keeps its "Now playing" tab in the violet
  accent, as the desktop kit does, since tabs are not play-related.
- Changed on purpose, from the Backdrop cards: the kits draw the old `AppShell`; the page now sits
  in the backdrop Sonora's latest mockups draw. The front layer is a rounded 1dp surface under the
  heading and the filters, with its corners kept at every scroll position.
- Changed on purpose: the filters moved out of the feed to the back layer's controls, as the
  Backdrop Anatomy card places a library-scope switch. On the phone they sit where the mobile kit
  has them, under the heading; on desktop they sit on the back layer, where the desktop kit had them
  at the top of the content.
- Changed on purpose: a scroll-spy subheader tops the front layer once content scrolls under it,
  as the Scroll-Spy Subheader card shows. At rest there is no band, so "Jump back in" sits where
  the kits put it: its text 144 px from the top against about 145 px on the phone, 180 px against
  about 192 px on desktop. Scrolled, the band lies over the content's top, so the feed never moves
  when it arrives.
- Changed on purpose: Search is a destination, first on the rails and last on the bottom bar, as
  nav.json orders them; the desktop kit's rail has no Search and the mobile kit's bar ends with it.
- Changed on purpose: Settings is a row at the foot of the rail (NavRail `footerItems`, added to
  Sonora for it) and, on the phone, behind the account avatar. The desktop kit's rail lists Settings
  among the destinations and ends in a theme switch and library name, and the mobile kit also draws
  a settings button at the heading's end; the page has neither.
- Changed on purpose: the rail has no expand toggle; its width follows the window, an icon rail
  from 600 px and a labelled rail from 1024 px, where the kit and the Anatomy card draw a hamburger.
- Changed on purpose: nav.json's icons and labels (Books with `book_2`, Music with `album`) replace
  the kits' (Audiobooks, headphones, speaker).
- Changed on purpose: the filter reads All, Music, Podcasts, Books, the plan's order, where both
  kits draw All, Music, Audiobooks, Podcasts.
- Open: the account avatar is a person glyph, since the placeholder names no picture; the mobile
  kit shows a photo. `AccountButton` takes one.
- Open: the front layer shows the browser's own scroll bar while it scrolls (the phone render,
  scrolled); the kits' page scroll hides it on the phone.
- Open: one page serves both kits, so desktop shows "Artists & authors" before "Picked for
  you" and keeps "Recently played", where the desktop kit swaps the two and ends there.
- Open: every "Recently played" row draws its divider; the kit drops the last one, which the
  page format cannot express yet.
- Fixed earlier, still true: the page follows the mobile kit section for section, the feed's gaps
  come from untitled and titled `Section`s, the browser's body margin is reset, and `LayoutGrid`
  auto-fills wide items capped at `--grid-max-width-tiles` 10 px apart, as the desktop kit does.

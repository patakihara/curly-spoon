---
page: podcasts
pageHash: 4a38e69ed271d18d1d59015b9e9083af96fd31c8680c64ee856e196f55d501e0
sonora: [kit:desktop/podcasts, kit:mobile/podcasts]
spotify: [S20, S31]
---

# Podcasts

Canvas renders: `podcasts/canvas-phone.png` (390 px) and `podcasts/canvas-desktop.png` (1440 px),
both in the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-desktop-podcasts.png` and `sonora/kit-mobile-podcasts.png`. Also looked at: the page
scrolled on the phone (the local search out, the spy band on "Shows", the Lists and the YouTube
row), Spotify's S20 (subscribed shows with an unplayed dot) and S31 (the sort row).

## What the Sonora UI kit renders show

- **Mobile kit.** "Podcasts" with search and settings buttons, no tabs, an empty band, then a
  3-across grid of show covers captioned "Podcast · 212 eps", one with a resume bar, one "not in
  library".
- **Desktop kit.** The same grid at 190 px, 3 across, "Podcast · 212 episodes" captions.

## What the canvas page draws

The back layer holds "Podcasts" ending in the local search's button (`BackLayer search="Search your
shows and their episodes"`). No filter row. The front layer has a scroll-spy subheader: no band at
rest, then the section title that last passed ("Shows" in the scrolled look). The body: the
`SortFilterBar` "Title" with the `ViewToggle` opposite (the picker holds Title, Host, Random), then
"Shows", every subscribed show in title order as a `MediaCard` with its unplayed count as the
caption and, when there are unplayed episodes, Sonora's accent dot on the art, as S20 marks them.
"Fleeting Verses" is a YouTube channel, captioned "YouTube · 2 unplayed". Then "Lists" (The Digest
first, Commute, Saved for later), and "Add a YouTube channel": an `Input` for the link and a
secondary `Button` "Add as a show".

**Empty state**, per nav.json (not drawn as an artboard): the heading and sort row stay; the Shows
grid gives way to one line saying there are no subscriptions, pointing to Search's podcast results
or to pasting a YouTube channel link, with the Add a YouTube channel row kept.

## Differences

- Matches: the 3-across phone grid of show covers.
- Changed on purpose: on desktop the Shows and Lists grids fill the front layer, where the kit's grid stops at 190 px
  columns and leaves the row's end empty. Sonora's `LayoutGrid` decides the count: as many columns
  as its 160 px minimum allows, sharing the rest, so 4 across at 184 px beside the panel at 1440 px,
  3 at 1240, 4 at 1024, 3 at 600 and 7 at 1920, as the plan's "bigger on desktop" asks.
- Changed on purpose: captions carry the unplayed count, as nav.json's Shows section asks, not
  "Podcast · 212 eps"; the unplayed dot follows S20.
- Changed on purpose: the kit's empty band is a scroll-spy subheader, hidden at rest.
- Changed on purpose: the kit's app-bar search is the back layer's local search, out on scroll.
- Changed on purpose: a sort row leads the grid, as in S31.
- Changed on purpose: Lists and Add a YouTube channel follow the shows (both provisional in
  nav.json); the kit has neither. Lists have no art, so they take `MediaCard`'s generated tint.
- Changed on purpose: no "Not in library" show; a home shows only your subscriptions.
- Open: the `Input` draws no visible field on the dark front layer, so the link box reads as bare
  placeholder text; `Input` is due its fix when Sonora is pruned.
- Open: the Host sort is this page's reading of "Title, Artist or Author, Random" for shows.
- Open: the Downloaded filter is Android's alone and not drawn.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.

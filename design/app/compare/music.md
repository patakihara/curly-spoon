---
page: music
pageHash: 98cdde59b1a284e30a58f409552a22d139231a3eb179a06c588126b3b7ab3e1d
sonora: [kit:mobile/music, kit:desktop/music]
spotify: [S31]
---

# Music

Canvas renders: `music/canvas-phone.png` (390 px, the bottom bar's layout) and
`music/canvas-desktop.png` (1440 px, the labelled rail with the Now Playing panel), both in the
app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-mobile-music.png` and `sonora/kit-desktop-music.png`. Also looked at: Sonora's Media &
Artist Cards card (the request pills) and the new Backdrop Local Search card, rendered at rest and
scrolled, and Spotify's S31 (Your Library) for the sort row.

## What the Sonora UI kit renders show

- **Mobile kit.** The account avatar and "Music" in the app bar, a search and a settings button at
  its end. Under it, on the page surface, the `TabBar` Artists, Albums, Songs with Songs active, a
  `ViewToggle` alone at the top right of the collection, then the songs as a list of rows with art,
  title and "artist · duration". Mini-player and bottom nav below.
- **Desktop kit.** The same in the rail layout: title and search button in the bar, the tabs on the
  front layer, the toggle at the collection's top right, a song list. The rail carries a theme
  switch and library name; the Player panel is on the right.

## What the canvas page draws

The page in the app shell. The back layer holds the heading "Music" (led by the account avatar on
the phone) ending in the local search's button: `BackLayer search="Search your music and
requests"`, which Sonora now draws as the kit's search morph moved to the backdrop heading. At rest
it is the search button the kit has; once the front layer scrolls, the heading becomes the field,
without focus; tapped, it comes out with focus. It searches only this library and its requests.
There is no filter row: nav.json's only Music filter is Downloaded, which is Android's. The front
layer's subheader is the `TabBar` (Albums, Artists, Songs, opening on Albums, its first tab) with its
static hairline.
Then `PageBody`: a `SortFilterBar` reading "Title" with the `ViewToggle` opposite it, as in S31,
and a `LayoutGrid` of `MediaCard`s filling their cells: 3 across on the phone, and on desktop
filling the front layer (4 across here, beside the panel). Albums are in title order. Two
are requests: "Paper Lanterns" with a "Needs choice" pill in the request tone, "Salt and Static"
downloading at 64% in the accent, its glyph sized to the pill's text (`--icon-2xs`), both with their art greyed since they cannot play yet.

Measured in the browser: page margin 16 px on the phone and 28 px on desktop, as in the kits;
desktop cards 184 px wide, 20 px apart, from x = 296 to the front layer's margin at x = 1091.

**Empty state**, per nav.json (not drawn as an artboard; the canvas has no variant form): the
heading, the tabs and the sort row stay; the grid gives way to one line saying there is no music
yet and pointing to Search to find, play and add music.

Each album card opens its Album page; the Artists tab, not drawn, holds the artist cards.

## Differences

- Changed on purpose: the kit opens on Songs as a list; the page opens on Albums as a grid, since
  the plan's library is "a 3-across grid on phones, bigger on desktop", and Albums leads the tabs,
  since a tab row opens on its first tab. The list view is the
  toggle's other state and is not drawn.
- Changed on purpose: on desktop the grid fills the front layer, where the kit's stops at 190 px
  columns and leaves the row's end empty. Sonora's `LayoutGrid` decides the count: as many columns
  as its 160 px minimum allows, sharing the rest, so 4 across at 184 px beside the panel at 1440 px,
  3 at 1240, 4 at 1024, 3 at 600 and 7 at 1920, as the plan's "bigger on desktop" asks.
- Changed on purpose: the kit's app-bar search button is now the back layer's local search, which
  comes out as the front layer scrolls (Sonora `BackLayer.search`, added for these homes).
- Changed on purpose: a sort row ("Title", the sort picker's current choice) leads the collection
  with the `ViewToggle` opposite it, as S31 draws, where the kit has the toggle alone. The picker's
  choices are Title, Artist and Random; the open picker is not drawn.
- Changed on purpose: requests are in the grid with their status tone (`MediaCard.status`, added to
  Sonora); the kit has none.
- Changed on purpose: no settings button at the heading's end, and the shell's rail and panel, as
  on Browse.
- Open: where the in-library (streamable) marker goes is still open in the plan, so no marker is
  drawn; the kit's "Not in library" pill is not used.
- Open: playlists and favourites are not placed yet, per nav.json.
- Open: the Downloaded filter that opens Downloads is Android's alone, and the page format has no
  per-platform content yet, so it is not drawn.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a greyed card is grey, its cover without colour and its title muted, not only darkened.

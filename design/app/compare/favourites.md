---
page: favourites
pageHash: 4ee75c46e735545d90dad91694aca84f7e548333951499c0f313411c0dc8ebe7
sonora: [kit:mobile/collection, kit:desktop/collection]
---

# Favourites

Canvas renders: `favourites/canvas-phone.png` (390 px) and `favourites/canvas-desktop.png` (1440
px), both in the app shell. Sonora UI kit renders: `sonora/kit-mobile-collection.png` and
`sonora/kit-desktop-collection.png`.

## What the Sonora UI kit renders show

- **Both kits.** A collection opened in full as a grid of cards under its title; no favourites
  screen exists in the kits.

## What the canvas page draws

The heading is nav.json's "Favourites", led by the close control. Only the songs, per nav.json:
`ResultRow`s at the list width, most recently favourited first, each with its art, "artist ·
album", the playing one marked, and an `OverflowMenu`: Add to playlist, and Add to library only on
a song you don't own.

**Empty state**, per nav.json: no favourites yet says the heart in Now Playing adds one.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: a song list, not the kit collection's grid.
- Changed on purpose: no header, play button or local search; nav.json gives the page only its
  songs.
- Provisional, per nav.json: the song rows.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Music's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.

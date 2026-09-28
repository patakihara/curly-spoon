---
page: favourites
pageHash: ed0594c045df49a2bab632aa52e2eef4251e3e83845320cf957717b2dfd52ded
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

- Changed on purpose: a song list, not the kit collection's grid.
- Changed on purpose: no header, play button or local search; nav.json gives the page only its
  songs.
- Provisional, per nav.json: the song rows.

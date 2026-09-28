---
page: playlist
pageHash: 7360ead9f0a928f9d5a4c3fcdceebe9052a209d4d7d6fff061140786773ed800
sonora: [kit:mobile/collection, kit:desktop/collection]
---

# Playlist

Canvas renders: `playlist/canvas-phone.png` (390 px) and `playlist/canvas-desktop.png` (1440 px),
both in the app shell. Sonora UI kit renders: `sonora/kit-mobile-collection.png` and
`sonora/kit-desktop-collection.png`. Also looked at: the kits' album screens, the header a playlist
shares, and the Media Header card.

## What the Sonora UI kit renders show

- **Both kits.** A collection opened in full: the title in the app bar, a list or grid toggle, then
  a grid of `MediaCard`s. No playlist screen exists in the kits.

## What the canvas page draws

The heading is the playlist's name, bound from its data, with the local search ("Search this
playlist"). A `MediaHeader` without a title: the first song's art, "PLAYLIST", "8 songs · 32 min",
Play and Add to queue. Then the songs in your order as `ResultRow`s with their art, the playing one
marked, each ending in a drag handle (`IconButton drag_handle`) for reordering.

**Empty state**, per nav.json: an empty playlist says songs are added from any song's menu.

## Differences

- Changed on purpose: a list of songs, not the kit collection's grid; a playlist is ordered songs.
- Changed on purpose: the header of an album, without its title, since the heading names it.
- Provisional, per nav.json: the header and the reorderable rows; the handle is a plain
  `IconButton`, and there is no edit mode or per-song menu yet.
- Open: a playlist's cover is the first song's art here; a mosaic has no Sonora component.

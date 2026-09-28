---
page: playlist
pageHash: 512d72eb74411385561ab87a0537edeae2ccf3dae7e32f136ae450dd590dcf74
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
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Music's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.

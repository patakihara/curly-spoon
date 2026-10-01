---
page: album
pageHash: bdb30721a762f59e41215d8613d07c5c33c416fab73df274b627dddf9834e521
sonora: [kit:mobile/album, kit:desktop/album]
spotify: [S02, S35]
---

# Album

Canvas renders: `album/canvas-phone.png` (390 px) and `album/canvas-desktop.png` (1440 px), both in
the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-mobile-album.png` and `sonora/kit-desktop-album.png` (the phone capture now opens the
first card, not the account avatar). Also looked at: the Media Header card, the new Overflow Menu
card, and Spotify's S02 (a show's header, "Find in this show") and S35 (an item's own verbs beside
its play button).

## What the Sonora UI kit renders show

- **Mobile kit.** A back arrow, a search glyph and a menu glyph in the app bar; the cover centred
  at about 208 px, "ALBUM", the title in the display face, the artist as an accent link, "2023 · 5
  tracks · 18 min", then Play (rose), Next and Last; then rows with each track's art and a play
  overlay.
- **Desktop kit.** Art at 232 px beside the text, the same kind line, title, artist link, meta and
  the three buttons; rows with art, "In library" and "Requested · 64%" pills, and the playing row's
  equalizer bars.
- **S02, S35.** A search scoped to the item under the back arrow; the item's verbs beside its play
  button, the rest behind a three-dot menu.

## What the canvas page draws

The back layer's heading is the album's name, bound from its data (`BackLayer title={data.title}`),
led by the close control and ending in the local search's button ("Search this album"). The front
layer, at the list width: a `MediaHeader` with the cover, "ALBUM", the artist as an accent link
that opens the artist's page (`onSubtitle={<Open page="artist" ref={data.artistRef} />}`) and "2022 · 8 tracks
· 36 min · Plays from YouTube Music", and no title of its own, since the heading names the album.
Its buttons are Play and Add to queue only (an album's default is the end of the queue; play next
is the long press), then an `OverflowMenu`, closed as every menu starts, holding Add to library ("A lossless copy,
by torrent") and Go to artist. Then eight numbered `ResultRow`s, the second playing (its number in
the play ink and the equalizer bars), each with its own `OverflowMenu`: Add to library and Add to
playlist on a song you don't have, only Add to playlist on the one you kept. Then an `ExpanderRow`,
"3 editions · Original, Deluxe, Japan", folding the editions under the one album, and "More by Deep
Inertia" as a `Shelf` of `MediaCard`s.

**Empty state**, per nav.json: not found, or no tracks resolved, keeps the header and says why in
one line where the tracks would be.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Matches: cover, kind line, the artist as an accent link to their page, meta and the rose Play; the playing row's equalizer bars; the
  kit's search glyph, here the backdrop's local search.
- Changed on purpose: the album's name is the page heading and the header has no title (Sonora's
  `MediaHeader.title` is now optional), so it is said once, as on Shelf.
- Changed on purpose: two buttons, Play and Add to queue, where the kit has Play, Next and Last:
  04-play puts play next on the long press, and nav.json names only these two.
- Changed on purpose: Add to library sits in the header's menu, never a button (06-get). The page
  draws the menu closed, as the apps start it; the canvas's `phone-menu` artboard shows it open, a
  modal bottom sheet (Sonora's `OverflowMenu` on mobile) over a scrim that covers the page, the
  bottom bar and the mini-player. On desktop it hangs from its button.
- Changed on purpose: rows lead with the track number, not the art every track shares (Sonora's
  `ResultRow.number`), and end in a menu instead of a status pill; there is no "In library" pill
  on a row.
- Changed on purpose: an album you don't own says it plays from YouTube Music in its meta line; the
  kit has no unowned album.
- Provisional, per nav.json: the editions fold and "More by", drawn as a guess.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Music's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.

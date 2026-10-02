---
page: artist
pageHash: 6d0c4427fb55122ad0094ae15a667f3c2087402ad21b6b2938fc17eda364c496
sonora: [none]
spotify: [S41]
---

# Artist

Canvas renders: `artist/canvas-phone.png` (390 px) and `artist/canvas-desktop.png` (1440 px), both
in the app shell. Sonora has no artist screen, so there is no UI kit render; looked at instead: the
Sonora kits' album screens (`sonora/kit-*-album.png`, the detail page an artist's would echo), the
Media Header card with the round, action-less header, the Media Cards card's "Not in library" and
request states, and Spotify's S41 (the artist card: a big image, the name, follow and a bio).

## What the sources show

- **Kits' album screens.** `MediaHeader` over a list; `round` exists for a person, unused there.
- **S41.** The artist's photo, the name with a verified mark, a follow button, a clamped bio, and
  credits as round `ArtistCard`s on a shelf.

## What the canvas page draws

The heading is the artist's name, bound from its data, led by the close control; no local search,
since nav.json gives the artist page none. A round `MediaHeader` with no title (the heading names
them) and no buttons, only "ARTIST" and "9 releases · 2 in your library": on the phone centred
under the image, on desktop a caption centred beside it, the meta at the subtitle's size, the
header Sonora draws for a person with no title and no buttons. Then "In your library",
a `Shelf` of what you own by them, each card opening its album
(`onClick={<Open page="album" ref={item.ref} />}`). Then the discography, one `Section` and `Shelf` per group,
Albums, EPs, Singles, Compilations, Live, one entry per album, each opening its album: owned titles plain, a requested one
with its "Downloading · 42%" pill in the progress tone, the rest greyed with "Not in library"
(`MediaCard.absent`). EPs and the smaller groups use the compact card. Then "Popular", song rows each
with its `OverflowMenu`, Add to library only on a song you don't own, and "Similar artists", round
`ArtistCard`s.

**Empty state**, per nav.json: owning nothing by them drops the "In your library" carousel and
shows the whole catalogue greyed and requestable.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Matches S41: the round image and the name leading the page, round cards for other artists.
- Changed on purpose: on desktop the header is the image with a caption centred beside it, not
  S41's wide photo over the name; the name is already the heading, and nav.json's header is only
  the image and the name.
- Changed on purpose: no follow button, bio, verified mark or listener counts; nav.json's header is
  the image and the name.
- Changed on purpose: the name is the heading, not repeated in the header, as on Album and Shelf.
- Changed on purpose: the discography is a carousel per group, never mixing editions; a greyed card
  requests through its album page's menu, so no card carries a request button.
- Changed on purpose: every card opens its album, and a greyed one is requested there, from the
  album's menu; the card itself has no menu (`MediaCard` has only `onMore`, a corner button).
- Provisional, per nav.json: Popular and Similar artists, drawn as a guess; the setting that hides
  unowned titles is Settings' and not drawn here.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Music's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a greyed card is grey, its cover without colour and its title muted, not only darkened.

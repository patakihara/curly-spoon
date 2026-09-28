---
page: artist
pageHash: d71c79fc6c78d62486ac9c86dab3b97d90dc33f951df005c44d1d2c50a8dd0cc
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

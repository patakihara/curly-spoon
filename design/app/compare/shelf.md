---
page: shelf
pageHash: 5662948ba69973ac277ff916a0c60ba6709491db6090856e0bae725c0083deec
sonora: [kit:mobile/collection, kit:desktop/collection]
spotify: [S12]
---

# Shelf

Canvas renders: `shelf/canvas-phone.png` (390 px) and `shelf/canvas-desktop.png` (1440 px), both in
the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-mobile-collection.png` and `sonora/kit-desktop-collection.png`. Also looked at: the
Contextual Headers card (SectionHeader with an eyebrow, subject art and now a trailing control)
and Spotify's S12 for the shelf header.

## What the Sonora UI kit renders show

- **Mobile kit.** "Recently added" as the app-bar title with a back arrow and a menu, the list
  toggle alone at the top right, then a 3-across grid of `MediaCard`s with "Album · …",
  "Book · …" and "Podcast · …" captions, resume bars on two books and a not-in-library glyph.
- **Desktop kit.** The same, a grid of 190 px cards 3 across with a "Not in library" pill, beside
  the Player panel.
- **Spotify S12.** A shelf headed by its subject: the subject's art, the eyebrow "More like" and
  the subject's name, then the carousel.

## What the canvas page draws

The back layer holds the heading in SectionHeader's context form, named by the shelf's subject
(`BackLayer title={data.subject} eyebrow={data.eyebrow} image={data.subjectArt} round={data.round}`):
the round art of Deep Inertia (an artist), the eyebrow "More like" over "Deep Inertia", led by a
close control (the shelf closes to Browse), and ending in the local search's button
(`BackLayer search="Search this shelf"`, out as the front layer scrolls) and the `ViewToggle`.
On the phone that heading is the top app bar, in the body face; on desktop it is the backdrop's
display heading. The front layer, with no subheader and no header of its own, holds one `Section`
with a `LayoutGrid` of seven `MediaCard`s, none of them the subject's own work, captions naming
each item's type, one with a resume bar: 3 across on the phone, 4 across beside the panel on
desktop, filling the front layer as the library homes do.

**Empty state**, per nav.json: a shelf with no items is never offered on Browse; reached by an old
link, the page says the shelf has gone, with the way back to Browse.

## Differences

- Matches: the 3-across phone grid, captions naming the type, resume bars, the toggle at the top
  right of the collection.
- Changed on purpose: the shelf is headed by its subject, as S12 and Browse's shelves have it:
  the subject's art and the eyebrow "More like" over its name, in the heading itself; the kit has
  only the title in the app bar. No header over the items says it again.
- Changed on purpose: the view toggle ends the heading, beside the search button, instead of a row
  of its own.
- Changed on purpose: the grid fills the front layer on desktop (4 across at 1440 px), as on the
  library homes.
- Changed on purpose: no "Not in library" pill; where an in-library marker goes is still open in
  the plan.
- Changed on purpose: the heading is the shelf's own, as the kit's app bar says "Recently added",
  not nav.json's "Shelf".
- Open: paging is not drawn; the placeholder holds one page of items.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control, the subject's art and the eyebrow over the subject's name, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Browse's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`) and filled: solid bars, not the icon font's hairline outline.

---
page: shelf
pageHash: f17fa1d85199a11addd8034d456faf2ea0ab0fa7670fc430398a9e9f47ecc5f3
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

The back layer holds the heading, the shelf's own title "More like Deep Inertia", bound from its
data (`BackLayer title={data.title}`), led by a close control (the shelf closes to
Browse), and ends in the local search's button (`BackLayer search="Search this shelf"`, out as the
front layer scrolls). The front layer, with no subheader, holds one `Section` whose header is the shelf as on
Browse: the eyebrow "More like", the subject "Deep Inertia" and its round art (an artist), with
the `ViewToggle` at its trailing edge (Sonora's new `Section.trailing`). Below it a `LayoutGrid`
of seven `MediaCard`s, none of them the subject's own work, captions naming each item's type, one with a resume bar: 3 across on the
phone, 4 across beside the panel on desktop, filling the front layer as the library homes do.

**Empty state**, per nav.json: a shelf with no items is never offered on Browse; reached by an old
link, the page says the shelf has gone, with the way back to Browse.

## Differences

- Matches: the 3-across phone grid, captions naming the type, resume bars, the toggle at the top
  right of the collection.
- Changed on purpose: the shelf's own header (eyebrow, subject, subject art) leads the items, as
  S12 and Browse's shelves have it; the kit has only the title in the app bar.
- Changed on purpose: the view toggle shares the header's row instead of a row of its own.
- Changed on purpose: the grid fills the front layer on desktop (4 across at 1440 px), as on the
  library homes.
- Changed on purpose: no "Not in library" pill; where an in-library marker goes is still open in
  the plan.
- Changed on purpose: the heading is the shelf's own title, as the kit's app bar says "Recently
  added", not nav.json's "Shelf"; the header over the items keeps the eyebrow and the subject's art
  with only the subject's name, "Deep Inertia", so no line says the whole title twice.
- Open: paging is not drawn; the placeholder holds one page of items.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Browse's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-icon`).

---
page: requests
pageHash: 5dca584fad813b80dbaacb172cde149103c295490a17ba7e3fdca2feceea1601
sonora: [none]
---

# Requests

Canvas renders: `requests/canvas-phone.png` (390 px) and `requests/canvas-desktop.png` (1440 px),
both in the app shell. No Sonora UI kit screen exists for Requests (nav.json names `none`), so the
page is compared with the Result Rows card (the request states of `ResultRow`) and the kits'
search screens, whose rows carry the same statuses. No Spotify screen covers it.

## What Sonora shows for requests

- **Result Rows card.** Rows with "In library", "Requested · 87%" (a ring over the art),
  "Queued" (a clock), "Searching…" (a spinning ring) and "Failed" (an error glyph), each pill in
  its tone; on a phone a status with a percentage keeps only the percentage.
- **Search kits.** The same rows in a flat list, with no action at the row's end.

## What the canvas page draws

The back layer holds the heading "Requests", led by a close control; Browse stays lit, since
Requests is reached from Browse and from Search's "Your requests". No subheader. In `PageBody` at
the list width:

- **In flight**: every album and book on its way, one `ResultRow` each, its meta naming type,
  creator, source and size ("Album · Soul Vertex · Prowlarr · 412 MB"), its status in the plan's
  vocabulary and tone (Downloading at 38%, 64% and 18%, Importing, Searching…, Failed), and at its end an
  `IconButton`: ✕ Cancel, or ↻ Retry on the failed one.
- **Needs choice**: each album torrent where no release clearly wins, with its status pill and ✕, then
  its candidates as rows naming format, track fit, size and seeders ("FLAC · 12 of 12 tracks ·
  1.1 GB · 41 seeders"), each with a "Choose" button: one tap picks it. One album with three
  candidates; a book never waits here, since its release is picked automatically.

No podcasts: subscribing is instant.

**Empty state**, per nav.json (not drawn): one line saying nothing is requested, and that Search
is where things are requested, as Sonora's `EmptyState`.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: a row ends in its action (Cancel or Retry) as an `IconButton`, where the
  card's rows act only through the art's hover overlay, which a phone does not have.
- Changed on purpose: the statuses follow the plan's vocabulary: "Downloading · 38%" rather than
  the card's "Requested · 87%", and "Importing", which the card lacks.
- Open: the candidates repeat the request's art, since a release has none of its own; they are not
  indented under their request, as Sonora has no nested row.
- Open: the phone truncates longer metas ("AudiobookBay · 286 …"); ResultRow keeps one line.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Browse's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.

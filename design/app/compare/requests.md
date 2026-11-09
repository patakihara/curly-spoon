---
page: requests
pageHash: ff8bf09a4117c67fcd617617e7785a6789de60d3092f23cf355adcf5185c0c82
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
  `IconButton` that cancels it. A failed row keeps ↻ Retry drawn on its art, at every width, in place
  of the error glyph, and the same ✕ at its end. One with other releases left carries a row under it,
  "Pick another release", which takes the next one in one tap.
- **Needs choice**: each album torrent where no release clearly wins, with its status pill and ✕, then
  its candidates as rows whose wrapping line names format, track fit, size and seeders ("FLAC · 12 of 12 tracks ·
  1.1 GB · 41 seeders"), each with a "Choose" button: one tap on the row or the button picks it. One album with three
  candidates; a book never waits here, since its release is picked automatically.

No podcasts: subscribing is instant.

**Empty state**, per nav.json: Sonora's `EmptyState`, saying nothing is requested and that Search is
where things are requested, with one way on, "Go to Search".

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: every row ends in ✕ Cancel as an `IconButton`, where the card's rows act only
  through the art's hover overlay. A failed row's retry stays on the art, drawn at every width.
- Changed on purpose: the statuses follow the plan's vocabulary: "Downloading · 38%" rather than
  the card's "Requested · 87%", and "Importing", which the card lacks.
- Open: the candidates repeat the request's art, since a release has none of its own; they are not
  indented under their request, as Sonora has no nested row.
- Open: the phone truncates longer metas ("AudiobookBay · 286 …"); ResultRow keeps one line. A failed request's reason and a candidate's format, source and size go in `detail`, which wraps.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Browse's rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a verb that fails says so in a `StatusBanner` over the rows, drawn on this canvas page with its words, and the row stays as the server has it. While a verb is on its way, that request's rows draw disabled.
- Changed on purpose: a list that failed to load draws the page's `failed` state, on its own phone artboard: Sonora's `EmptyState`, as Search's, with "Try again".

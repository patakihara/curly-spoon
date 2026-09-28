---
page: requests
pageHash: 288179b1b17643b305e1affa5651fc0e8b4e232a6a5cb5629140b9c15eb0d498
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

- Changed on purpose: a row ends in its action (Cancel or Retry) as an `IconButton`, where the
  card's rows act only through the art's hover overlay, which a phone does not have.
- Changed on purpose: the statuses follow the plan's vocabulary: "Downloading · 38%" rather than
  the card's "Requested · 87%", and "Importing", which the card lacks.
- Open: the candidates repeat the request's art, since a release has none of its own; they are not
  indented under their request, as Sonora has no nested row.
- Open: the phone truncates longer metas ("AudiobookBay · 286 …"); ResultRow keeps one line.

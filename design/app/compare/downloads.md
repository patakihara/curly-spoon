---
page: downloads
pageHash: e6753a62c5a75fa5720386d4fc7f52a7021f00ad29aae36ea6efe6ffd4528102
sonora: [none]
---

# Downloads

Canvas renders: `downloads/canvas-phone.png` (390 px) and `downloads/canvas-desktop.png` (1440 px,
an Android tablet's width), both in the app shell. Downloads is Android only, so the web app has no
route for it: `pnpm canvas:shoot` generates the page as the web generator would and mounts it for
the render. No Sonora UI kit screen exists for Downloads (nav.json names `none`); the page is
compared with the Episode Rows & Downloads card, which holds `DownloadButton`'s three states,
and the Mini Player, Result Rows & Media Header card, whose request rows carry the same statuses.
No Spotify screen covers it.

## What Sonora shows for downloads

- **Episode Rows card.** `DownloadButton` idle (a download glyph), downloading (a determinate
  ring with a stop square) and done (a tick, which removes the download when pressed), on an
  episode's action bar.
- **Result Rows card.** Rows with a ring over the art at a percentage, "Queued" with a clock, and
  a status pill in its tone.

## What the canvas page draws

The heading "Downloads" led by a close control; on desktop the rail lights Music, the first page
that opens it; nothing is lit in the bottom bar. In `PageBody` at the list width:

- **Downloaded**: first a `ValueRow`, "On this phone · 2.1 GB · 38 GB free", the total the
  downloads take; then one `ResultRow` per item, its meta naming kind, creator and size ("Book ·
  Rosa Elin · 38 files · 612 MB": a book is one row however many files it is), and an
  `IconButton` Remove (a bin) at its end.
- **In progress**: the downloads still running, each with its status in the progress tone
  ("Downloading · 36%" with the ring over the art, "Queued" waiting for Wi-Fi) and ✕ Cancel.

**Empty state**, per nav.json (not drawn): Sonora's `EmptyState` saying nothing is downloaded, and
that a book, episode or album downloads from its page.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: a download is removed with an explicit bin at the row's end, not by pressing
  a done `DownloadButton`, whose tick says "downloaded" rather than "remove".
- Changed on purpose: a running download is a row with its status and ✕, as Requests draws a
  request in flight, not a `DownloadButton` ring beside a ring already over the art.
- Open: rows do not open their book, episode or album yet. On a phone a `ResultRow` with a tap
  handler shows a play overlay over its art, which would say the tap plays; no drawn page gives a
  `ResultRow` a tap yet.
- Open: the total is a `ValueRow` at the top of Downloaded, not a storage bar; Sonora has none.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`): the close control and the title on the page surface, no back layer. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Music lit on the rail.

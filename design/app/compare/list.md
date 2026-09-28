---
page: list
pageHash: 6f08bc2fe02a57198e02ea9681c450ae3e7f8ad7ef46a3d707f3fd87001ae59f
sonora: [kit:mobile/collection, kit:desktop/collection]
spotify: []
---

# List

Canvas renders: `list/canvas-phone.png` (390 px) and `list/canvas-desktop.png` (1440 px), both in
the app shell; the phone scrolled to the episodes was also read. Sonora UI kit renders, the design
this page is compared against: `sonora/kit-mobile-collection.png` and
`sonora/kit-desktop-collection.png`. nav.json names no Spotify screen. Also looked at: the Episode
Rows card and the drawn Show page.

## What the Sonora UI kit renders show

- **Mobile kit.** "Recently added" under a back arrow and a menu, a list/grid toggle, then a
  3-across grid of mixed items with progress and "not in library" states.
- **Desktop kit.** The same grid, 190 px covers, in the backdrop with the rail and the player panel.

## What the canvas page draws

One kind, a digest. The heading is its name, "Morning", led by the close control. A `MediaHeader`
with "DIGEST" and "3 shows · 5 episodes · oldest first", Play and Play next on the spoken queue, and
the menu (Play newest first, Choose shows, Rename, Delete digest). Then "Shows", a shelf of its
three shows, each opening its page, then "Episodes": a `SortFilterBar` "Oldest first" and five
`EpisodeRow`s in date order, each naming its show, one part-played, each opening its page and
playing on the spoken queue.

**The other kinds**, in data only, the same page: a **podcast playlist** has no Shows section and
lists its episodes in your order, dropping each once played; a **listening list** holds books and
limited-run shows, crosses off finished items instead of dropping them, and ends in "Add next",
recommendations to add, filterable by type. No list ever replaces your queue.
**Empty**: says what fills it, a book's or episode's menu, or the digest's shows.

## Differences

- Changed on purpose: rows, not the kit's grid of covers; a list is read in order, and each episode
  needs its synopsis and show.
- Changed on purpose: a `MediaHeader` heads it with Play and Play next, which play the list on the
  spoken queue without replacing what is queued; the kit's collection has no header.
- Changed on purpose: a digest has no art of its own, so the header shows Sonora's flat accent
  placeholder.
- Changed on purpose: the play order is the list's sort row, and the header's meta says it too.
- Changed on purpose: on the phone the page sits under a top app bar, with no back layer, the
  bottom bar and mini-player kept; on desktop it keeps the Podcasts backdrop, its rail item lit.

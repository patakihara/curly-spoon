---
page: episode
pageHash: 391a4dc4defacbcc9c719654181b037d940094c69dded19986e80bbb2f4ae986
sonora: [card:episode-rows]
spotify: [S35]
---

# Episode

Canvas renders: `episode/canvas-phone.png` (390 px) and `episode/canvas-desktop.png` (1440 px), both
in the app shell; the desktop shows every section. Sonora render, the design this page is compared
against: `sonora/card-episode-rows.png`, the Episode Rows card. Also looked at: the Media Header
card's new episode header, dark and light, and Spotify's S35 (the episode page: title, the show
with its art, a meta chain ending in time left, "Finished" and a bar, save, download, share and menu
beside a play button, notes with "see more", comments).

## What the sources show

- **Episode Rows card.** The row's meta chain, "Finished" state, part-played rule and verbs
  (save, download, share, more, play).
- **S35.** The episode title as the page's heading, the show as a link, the resume figure and bar on
  the meta line, the verbs as round icons beside one play button, the notes clamped with "see more".

## What the canvas page draws

The heading is the episode's title, bound from its data, led by the close control. A `MediaHeader`
with the show's art, "EPISODE", the show as an accent link to its page, "12 Aug 2026 · 52 min ·
31 min left" and the bar under it; then Resume, Play next, both on the spoken queue, a round "Add to
a list" button (`addLabel`), on the phone the download control, and the menu (Mark as played, Go to
show). Then "Show notes" in an `ExpandableText` clamped at four lines with "see more", then "More
from the show", three `EpisodeRow`s, each opening its page and playing on the spoken queue.

**An episode of a show you don't follow**, per nav.json, in data only: Resume reads Play, and
playing it subscribes you to the show; its other episodes are greyed as on Show. `MediaHeader` has
no greyed state, so the header itself stays in colour.

## Differences

- Matches S35: the title heads the page, the show is a link, the meta ends in time left with the bar
  that shows it, the notes clamp with "see more".
- Changed on purpose: Resume and Play next are labelled buttons, as on Book, not one icon; Play next
  puts it next on the spoken queue.
- Changed on purpose: add to a list is a round button of its own, beside the download control, not
  Spotify's save; share is left out.
- Changed on purpose: on the phone the round controls wrap to their own line under the two buttons,
  kept together so the menu is never alone.
- Changed on purpose: no play count and no comments; nav.json's sections are header, actions, show
  notes and more from the show.
- Changed on purpose: on the phone the page sits under a top app bar, with no back layer, the
  bottom bar and mini-player kept; on desktop it keeps the Podcasts backdrop, its rail item lit.

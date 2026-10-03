---
page: show
pageHash: fdb5cc429e6a797a726726f5299be7dcf6418f18d67a66827d6ff2714c34231e
sonora: [card:episode-rows]
spotify: [S01, S02]
---

# Show

Canvas renders: `show/canvas-phone.png` (390 px) and `show/canvas-desktop.png` (1440 px), both in
the app shell; the page scrolled on both was also read, for About and the related shows. Sonora
render, the design this page is compared against: `sonora/card-episode-rows.png`, the Episode Rows
card. Also looked at: Spotify's S02 (a show's header: art, title, hosts, "Following" beside bell,
gear and menu, a scoped "Find in this show", tabs, "All episodes • Newest") and S01 (the episode
list scrolled: synopsis, meta chain, "Finished" with a check, per-episode verbs), and the drawn Book
and Album pages as the detail pattern.

## What the sources show

- **Episode Rows card.** `EpisodeRow` finished, part-played (a rose rule under the meta), unstarted,
  explicit and now greyed, with `DownloadButton`'s three states beside them.
- **S02.** The subscribe control states the state ("Following"); bell and gear sit beside it; search
  is scoped to the show.
- **S01.** Episodes carry a two-line synopsis and a meta chain; "Finished" is its own state; the sort
  is stated above the list and is the control.

## What the canvas page draws

The heading is the show's name, bound from its data, led by the close control and ending in the
local search's button, "Search this show's episodes". A `MediaHeader` with the show's art,
"PODCAST", the host, "Weekly · 212 episodes · 5 unplayed", and in place of queue buttons a
`FollowButton` reading "Subscribed", then the menu (Mark all as played, Add to a digest). Then
"Episodes": a `SortFilterBar` "Newest first" and five `EpisodeRow`s newest first, the first
part-played with its rule and "31 min left", two "Finished", each opening its Episode page, its art's
play control playing it on the spoken queue. Then "About" in an `ExpandableText`, then "You might
also like", a shelf of shows, each opening its Show page.

**Unsubscribed**, drawn in data only: the button reads "Subscribe" and every episode is greyed
(`EpisodeRow absent`, the art without colour, the title muted); playing one subscribes you.
**Just subscribed**, the empty state: the episodes arrive within the hour, and the list says so.

**A YouTube channel** is the same page with "YOUTUBE" as its kind line, the marker, and the menu gains
a "YouTube settings" verb. nav.json has no page or sheet for those settings, only the Show's
provisional "YouTube settings" section, so they are not drawn.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Matches the Sonora card: `EpisodeRow` with synopsis, meta chain, the rose progress rule and
  "Finished" with its check; play glyphs white and filled over the art.
- Changed on purpose: no per-episode verbs under each row, as S01 has. Save and share have no Auralis
  meaning, and the Episode page carries play next, add to a list and download, so rows stay scannable.
- Changed on purpose: the subscribe control is "Subscribed" / "Subscribe" (`FollowButton labels`),
  the plan's word, and it stands alone: no bell or gear as in S02; a show's settings go in its menu.
- Changed on purpose: Spotify's Episodes / About / More like this tabs become sections in that order,
  as on Book, so nothing opens on a hidden tab.
- Changed on purpose: the sort row says "Newest first", not "All episodes • Newest"; there is no
  episode filter in nav.json.
- Changed on purpose: no rating, no verified badge and no play counts; nav.json's header is art,
  title, host and the subscribe state.
- Changed on purpose: on the phone the page sits under a top app bar, with no back layer, the
  bottom bar and mini-player kept; on desktop it keeps the Podcasts backdrop, its rail item lit.

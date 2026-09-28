---
page: browse
pageHash: a7c51358b06ed21bfd4078e03793e77bc996ee5d3465b9173a0d955cbb7f180e
sonora: [kit:mobile/browse, kit:desktop/browse]
spotify:
  [
    S05,
    S06,
    S07,
    S08,
    S09,
    S10,
    S11,
    S12,
    S13,
    S14,
    S15,
    S16,
    S17,
    S18,
    S19,
    S20,
    S21,
    S22,
    S23,
    S24,
    S25,
    S26,
    S27,
    S28,
    S29,
    S30,
  ]
---

# Browse

Renders: `browse/canvas-phone.png` (390 px), `browse/canvas-desktop.png` (1440 px). Sonora:
`sonora/kit-mobile-browse.png`, `sonora/kit-desktop-browse.png`. Spotify screens opened: S05,
S09, S12, S15 and S25 (the JPGs stay out of git, under
`design/sonora/assets/reference/spotify/`); the rest were read through their
`docs/screens/Sxx.md` notes.

## What the sources show

- **Sonora mobile kit.** Title "Browse" in the app bar, then a connected `ButtonGroup` of
  filters (All, Music, Audiobooks, Podcasts), All selected in the accent. "Jump back in": a
  2-up grid of `QuickPick` tiles, art on the left, title and a "Book · 6 h 12 m left" line.
  "Recently added": a `Shelf` of large `MediaCard`s (one with a progress bar) bleeding off the
  right edge, section action an arrow. "Artists & authors": a shelf of round `ArtistCard`s.
  Then "Picked for you" (small cards) and "Recently played" rows. Mini-player and bottom nav
  belong to the shell.
- **Sonora desktop kit.** The same feed at desktop density: title in the app bar, filters in
  the front layer's subheader, "Jump back in" as two columns of wide quick picks, shelves of
  large cards with arrow actions, "Picked for you". Nav rail left, the Now Playing panel right.
- **Spotify S05.** Filters pinned at the top with an avatar before them; an 8-tile two-column
  grid of resumable tiles, some with a progress bar or an unplayed dot; a wide episode feature
  card ("The next episode awaits": kind, title, blurb, add and play); "Your shows" shelf.
- **Spotify S09, S12.** Contextual shelves: a "More like" eyebrow over a bold title with the
  subject's round or square art leading the header. S12's "Jump back in" is a shelf of cards
  with a three-line caption (kind, title, artist).
- **Spotify S15, S25.** Tinted feature cards: art, title, meta, a two-line blurb, a
  "Preview episode/audiobook" button, add, and play. S25 stacks them under "Audiobooks for
  you" when the Audiobooks filter is on.

## What the canvas page draws

`PageBody`, the filter `ButtonGroup`, "Jump back in" as 2-up `QuickPick`s with progress,
"Recently added" as a `Shelf` of `MediaCard`s, a `FeatureCard` under "The next episode
awaits", a contextual "More like" shelf with eyebrowed cards, and a shelf of `ArtistCard`s.

## Differences

- Fixed: the filter row sat flush against "Jump back in". It is now an untitled `Section`,
  which carries the feed's gap, as the kit's subheader spacing does.
- Fixed: at 390 px "Jump back in" fell to one column; the kit (412 px) and S05 show 2-up.
  `columns={2}` now holds it, which matches the desktop kit's two columns too.
- Fixed: on desktop the quick picks ran the full width; they are now capped at
  `--grid-max-width-tiles`, as the desktop kit caps them.
- Fixed, by adding to Sonora: the kits pad each screen with a hand-styled `div`, which a page
  may not do. Sonora gained `PageBody` (page margin, feed top gap, reading width), which the
  `Shelf` bleed already assumes.
- Shell, part 2: no "Browse" title, app bar, nav rail or bottom nav, mini-player or Now Playing
  panel. Both kits draw these around the feed.
- Kept from Spotify, not in the kits: the wide episode `FeatureCard` (S05, S15) and the
  "More like" contextual shelf header with the subject's art (S09, S12). The kit's "Picked for
  you" and "Recently played" rows are left out; the real feed's sections land with M2.
- Open, M2: the `FeatureCard` shows no play, add or "Preview episode" actions. They appear
  once handlers are wired, and `preview` takes an element, which the page format does not
  allow; the real Browse screen decides.
- Open, M2: the offline `StatusBanner` (S05, S25) is a state, not the `full` placeholder.
- Left as Sonora draws it: quick-pick progress sits under the art, where S05 puts it under the
  title; the filter row has no leading avatar, since Auralis has no account chip there.

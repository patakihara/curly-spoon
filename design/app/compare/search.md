---
page: search
pageHash: 6d99767666e19e28e4077af4d0b46d8ae26aed30e1bb333297b8a9a2a3d1a602
sonora: [kit:desktop/search, kit:mobile/search]
spotify: [S03, S04, S32]
---

# Search

Canvas renders: `search/canvas-phone.png` (390 px) and `search/canvas-desktop.png` (1440 px), both
in the app shell. Sonora UI kit renders, the design this page is compared against:
`sonora/kit-desktop-search.png` and `sonora/kit-mobile-search.png`. Also looked at: the page
scrolled to its end on both widths, the Result Rows card, M2's backdrop page
(m2.material.io/components/backdrop, read with Playwright), and Spotify's S03, S04 and S32.

## What the Sonora UI kit renders show

- **Mobile kit.** The account avatar, a filled `SearchField` ("What do you want to listen to?")
  with its clear control and a settings button in the app bar, then a "RESULTS" label and four
  `ResultRow`s, each with a status pill: "In library" (violet), "87%" (with a ring over the art),
  "Queued", "Failed". No filters, no sections.
- **Desktop kit.** The same field centred in the app bar over the old content pane, five rows with
  "In library", "Requested · 87%", "Queued", "Searching…" and "Failed", and the Player panel.
- **Spotify.** S03/S04: the heading, then a white field pinned while category tiles scroll. S32:
  the query in the bar, type pills overflowing to the right, flat rows with a menu and an add
  control, and seven releases of one song folded behind "More releases · Show all".
- **M2 backdrop.** Back-layer content can filter the front layer; revealed, the back layer shows
  its controls and the front layer slides down, its subheader still naming what it holds ("See 64
  results"); concealed, the back layer gives context. It is revealed by tapping any input field on
  it and concealed by tapping the front layer or a conceal affordance on either layer.

## What the canvas page draws

The back layer, revealed, as M2 puts filters: the heading "Search" (led by the account avatar on
the phone), then as its controls a one-column `LayoutGrid` capped at the list width holding the
`SearchField` with the query "salt" and `autoFocus` (the field has focus; the keyboard is implied,
since Sonora has no keyboard), the kind filter `ButtonGroup` (All, Songs, Albums, Artists, Books,
Authors, Series, Podcasts, Episodes, Lyrics; All selected) and the scope `ButtonGroup`
(Everywhere, In your library, Outside). On the phone the kind row runs off the edge behind
ButtonGroup's edge fade, as S32's pills do. The front layer's subheader is a `SortFilterBar`
naming the active filters, "All kinds · Everywhere", with an `expand_less` glyph: tapping it
conceals the back layer. Then, in `PageBody` at the list width:

- **Top result**: one `ResultRow`, the album Salt and Static, whatever its type.
- **In your library**: a song, a book and a Lyrics match quoting the remembered line, each a
  plain row: it plays, with no status and no request action.
- **Not in your library**, with a "Your requests" text action leading to Requests: a song that
  plays from YouTube Music, an `ExpanderRow` "More releases of Salt", a book already requested
  (ring on the art, "Downloading · 42%" in the progress tone, a pressed "Requested" button; on the
  phone the pill keeps "42%"), a book with "Request", and a podcast with "Subscribe".

**Suggestions**, per nav.json, are not drawn: they are the state while typing, before results
come in, and a canvas page draws one state. As you type, the front layer holds a plain list of
suggestions under the focused field: titles, creators and series you have, plus recent searches,
each naming its kind ("Salt and Static · Album", "Soul Vertex · Artist"). Choosing one runs the
search and the results above replace them.

**Concealed state**: the back layer shrinks to the heading and the field; the results' header
still names the active filters, now with `expand_more`, and tapping it from any scroll position
slides the results down to show the kind and scope rows again.

**Empty states**, per nav.json: with no query, the front layer lists recent searches; with no
results, one line says nothing matched, in your library or outside it.

## Differences

- Changed on purpose: filters live in the back layer, revealed in this still, as M2 and the plan
  put them; neither kit has filters, and Spotify's pills sit in the page.
- Changed on purpose: results fall into Top result, In your library and Not in your library, where
  the kits show one flat "Results" list; the plan asks for the top result first, then the two
  sections.
- Changed on purpose: owned rows carry no pill at all, where the kits mark them "In library";
  the section heading already says so, and an owned result offers nothing to request.
- Changed on purpose: outside books and podcasts carry a Request or Subscribe button at the
  row's end (ResultRow `trailing`, as in S32), and a requested book shows its live status; the
  kits show status pills only.
- Changed on purpose: the kits' app-bar field moves into the back layer under the heading, as
  S03 lays it out; the kit's settings button is gone (Settings sits at the rail's foot or behind
  the avatar).
- Changed on purpose: rows on the phone keep only the percentage of a status ("42%"), as the
  mobile kit's "87%" does, now Sonora's rule for a phone's ResultRow.
- Open: the top result is an ordinary row; Spotify gives it a large card, and Sonora has no
  top-result card yet.
- Open: the revealed back layer takes about 210 px on the phone and 240 px on desktop, so the
  outside rows with Request and Subscribe sit below the fold in both stills (looked at scrolled);
  concealing it gives the results the screen.
- Open: suggestions are described, not drawn (see above).
- Open: a result row has no play control a page can show; ResultRow draws its art action only
  when given a handler, which a canvas page cannot pass.

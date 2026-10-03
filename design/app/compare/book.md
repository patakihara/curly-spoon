---
page: book
pageHash: 6f0406bab28374a8856c19dcf927e5a2d02c14ca94fc734b42d8c7da464b4d91
sonora: [kit:mobile/album, kit:desktop/album]
spotify: [S35]
---

# Book

Canvas renders: `book/canvas-phone.png` (390 px) and `book/canvas-desktop.png` (1440 px), both in
the app shell; a 1440 x 2300 render was also read for the sections below the fold. Sonora UI kit
renders, the design this page is compared against: `sonora/kit-mobile-album.png` and
`sonora/kit-desktop-album.png`, the detail page a book shares with an album. Also looked at: the
Media Header card with the new book in its series, the Media Cards card's "Not in library" and
request states, and Spotify's S35 (an item's resume figure and bar on its meta line, its verbs beside
play, a description with its own "see more"), with S01 and S02 for a scoped search and a detail
page's sections.

## What the Sonora UI kit renders show

- **Mobile kit.** A back arrow, search and menu glyphs; the cover centred, "ALBUM", the title, the
  artist as an accent link, a meta line, then Play (rose), Next and Last, then rows with art.
- **Desktop kit.** Art beside the text, the same kind line, title, link, meta and three buttons,
  rows with art and status pills.
- **S35.** "1h 21m left" and a progress bar on the meta line; the verbs in a row beside a play
  button; the description clamped with "see more".

## What the canvas page draws

The heading is the book's name, bound from its data, led by the close control and ending in the
local search's button ("Search this book's chapters"). At the list width, a `MediaHeader` with the
cover, "AUDIOBOOK", the author as an accent link to their page, and under it the series and its
number, "The Harbour Quartet · Book 2", a second accent link, to the series' page (Sonora's new
`partOf`). The meta line: "Read by Ada Quill · 11 h 40 m · 4 h 12 m left", the narrator
named because you own a second narration; the resume bar under it. Resume (rose) and Play next, on
the phone a download control (Sonora's new `download`, never drawn on a desktop), then an
`OverflowMenu` with Mark as finished and Go to author. "Chapters": twelve numbered `ResultRow`s,
each with its start on the book's one timeline and its length, the one you are in marked "23 min
left". "About": the description in `ExpandableText`, three lines and "see more". "Other
narrations": cards read by other narrators, each opening its own book page: Jonas Vale's full cast,
which you own, and the author's own reading, greyed "Not in library". Then "More in The Harbour
Quartet", its heading a link to the series, the rest of the series in order (the first finished,
the third greyed, the fourth "Downloading · 30%"), and "More by Evelyn Harper", a tap on a
book you own opening it, on one you don't requesting it.

**Empty state**, per nav.json: a book you don't own keeps the header and the about text, greyed art
and Request in place of chapters, then Requested with its progress. Only the full state is drawn in
M0; the greyed and requested states are drawn on the cards.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Matches: cover, kind line, the author as an accent link, the rose Play (here "Resume"), S35's
  resume figure and bar on the meta line, S35's clamped description with "see more".
- Changed on purpose: the book's name is the heading and the header has no title, as on Album.
- Changed on purpose: Resume and Play next, not Play, Next and Last: nav.json names play or resume
  and play next for a book; a book enters the spoken queue as its chapters (04-play).
- Changed on purpose: the series and its number are a second link under the author
  (`MediaHeader.partOf`), since nav.json's header holds the series and it has its own page.
- Changed on purpose: download is a control after the buttons on the phone only
  (`MediaHeader.download`); a desktop keeps nothing offline.
- Changed on purpose: rows lead with the chapter number, not the art every chapter shares; the
  current chapter carries what is left of it as a pill, not the equalizer bars, since the book is
  not what is playing.
- Changed on purpose: the rating is a `Rating` on its own line under the meta (`MediaHeader
rating`): a filled star, 4.6 and the listener count, "(17.7K)", as Sonora's S02 reference draws
  it; the plan's detail header carries a rating, and the kit has none.
- Changed on purpose: chapters, bookmarks, speed and sleep controls are not here; they live in the
  player (04-play).
- Changed on purpose: other narrations are cards opening that narration's own book page, greyed
  when you don't own it; a page may open another page of its own kind, which its links leave out.
- Provisional, per nav.json: "More in" the series and "More by" the author, drawn as a guess.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`), as the mobile kit's flat detail bar does: the close control and the title, set as a mobile section header in the body face, on the page surface, with no back layer and no rounded front layer behind it; a hairline marks the bar once the content scrolls. The bottom bar and mini-player stay. On desktop it keeps the backdrop, Books' rail item lit.
- Changed on purpose: the rail's head carries old Sonora's hamburger (`NavRail toggle`), `menu_open` on this labelled rail, on the heading's line; it collapses the rail to the icon rail and back. The mini-player's play and pause glyph is white (`--play-contrast`) and filled: solid bars, not the icon font's hairline outline.
- Changed on purpose: a book you don't own is greyed, its cover without colour and its title muted, and a tap on it requests it: the card says Requested (`MediaCard onRequest`, `<Request ref>` in the page), and its page stays a verb, Open, in the card's corner menu. A book you own opens its page.

# Open questions — Now Playing componentization

Answer inline (or in chat); nothing here blocks the build, each has a stated default I already shipped.

## The canonical shape

1. **Podcasts and audiobooks in the same player.** `NowPlaying` currently ships one page for
   everything. Books and episodes want a different transport (skip ±30s, chapter next/previous instead
   of track, speed as a first-class control) and have no lyrics at all.
   *Shipped default:* one shape, lyrics disabled when `lyrics.lines` is empty (the bottom bar's Lyrics
   action greys out). *Alternative:* a `kind="music" | "spoken"` prop that swaps the transport cluster
   and drops the lyrics tab entirely.

2. **Speed and Sleep are read-outs, not controls.** They render as `ValueRow`s that call back; there is
   no picker component behind them.
   *Question:* do you want a `SpeedSheet` / `SleepTimerSheet` (bottom sheet with preset steps), or is
   the consuming app expected to own those?

3. **Desktop: does the panel replace the queue panel, or absorb it?** Point 2 says the page is a side
   panel "just like the queue currently is". I read that as *one* panel with three tabs (Now playing /
   Queue / Lyrics), so the old queue-only panel is gone and the transport bar's queue button opens the
   panel on its Queue tab.
   *Confirm:* that the queue no longer has a panel of its own.

4. **Mobile: no bottom nav under the sheet.** The sheet covers everything, bottom nav included, and the
   bottom app bar takes its place. Correct?

## Details I picked a side on

5. **Sync state 2's marker.** "Current line indicated by an accented dot": I put an 8px accent dot in a
   gutter to the left of the line, every line at full strength. The alternative reading is a dot in the
   *margin of the sheet* (a scroll-position marker). Say if you meant the latter.

6. **Sync state 3 still scrolls?** No — `off` neither marks nor scrolls; the sheet is static and you
   read it yourself. State 2 (`dot`) also does not auto-scroll, so a tap-free glance never moves the
   text under your finger. If you want `dot` to keep following the song, that is one prop
   (`autoScroll`) away.

7. **Queue edit mode: what does "edit" enable?** I gave it selection (tap a row to select), drag
   handles on every row, per-row remove, and a bottom bar with the count and a Remove button. Out of
   edit mode, rows are tap-to-play with no handles.
   *Not built:* multi-select move ("move selection to top"), save-as-playlist, clear-all. Say which of
   those belong in the design system rather than the app.

8. **Where the bottom app bar's other two actions go.** Lyrics and Queue are yours; I filled the row
   with Output (`speaker`) and More (`more_horiz`) so the bar reads as a real bar rather than two
   buttons. Replace them via `actions` — or tell me the real two and I will make them the default.

## New: contextual shelf header

11. **A shelf whose heading is a two-line, art-anchored context line** — reference saved at
    `assets/reference/contextual-shelf-header.png`: a small square thumbnail of the *reason* for the
    shelf, an eyebrow naming the relationship ("Popular with listeners of"), the subject in display
    weight beneath it, and a text "Show all" pinned to the right — over a row of cards whose subtitle
    is the publisher rather than a duration.
    Our `SectionHeader` today is a single title plus an icon action, so this is a different component
    (a `ContextHeader`, or a `Shelf` variant).
    *Questions:* do you want it in the system? Which shelves earn it — recommendations only, or any
    "because you played X" row? And is "Show all" a text link here, breaking our icon-action rule for
    section headers, or should it stay the arrow?

## Housekeeping9. **The mini player is still 48px docked with separators top and bottom.** The sheet expands from its
   rect, so the two are now coupled: if the bar's shape changes, re-check the expansion.

10. **Templates.** There is no `templates/now-playing/` yet — the components exist, the starting folder
    does not. Say the word and I will add one alongside `templates/nav-rail`.

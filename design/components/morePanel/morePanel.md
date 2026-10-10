# morePanel

A control's More, in the back layer's panel: a bar with a close button (✕) and the title (its param's label), over its content (the More's control rows). Pressing ✕ sends `close`. While its rows scroll the bar stays at the top (`pinned`), on its own `fill`.

Its content slot (the More's rows, hire moreRow: no heading) follows the bar, rowGap apart; the bar is sticky while pinned.

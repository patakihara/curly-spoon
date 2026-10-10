# header

A bar: start items, a title, end items (role `bar`, also `peek`). With an `expanded` slot the bar is taller at the top of the content and collapses as it scrolls (supplied `progress` 0 → 1); the expanded content fades and scales down and the title fades in.

Dragging or wheeling on its expanded part (the detail) sends `scroll` with the new offset: the detail is a scroll surface, like the content below it.

Sizes Layout reads: `expandedHeight` (the bar with its detail; 0: no taller form, a hire with a detail sets it) and `maxWidth` (the peek card's widest; 0: none, the peek hire sets it).

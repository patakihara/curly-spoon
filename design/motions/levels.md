# levels

Loops while shown and playing: each part's height moves between `min` and `max` (in the component's grid units), like a level meter. `ms` = one beat; every part loops on its own length so they never line up. `stepped` jumps between levels instead of easing. Stopping eases back from wherever the parts are to the rest heights over settleMs (default one beat). Reduced: instant (parts stay at rest). Used by the logo.

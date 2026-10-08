# expandSurface

One motion: the surface grows to cover `to` over ms, its corners going to cornerTo; within it the old content fades out (split × fadeMs) and the new page fades through in, scaling from scaleIn.

`shared`: an element that moves between pages — the opening card's image flies into the detail page's image (shell measures both into `Measurements.shared`). Not for carousel entries.


revealBand (px, optional): the page doesn't grow from the front layer's shape. It shows only in its top revealBand px (still) and from its sheet's top down; that edge moves with the sheet, which slides up from the front layer (ms, easing). Nothing else moves (sample design: revealBand 100, scaleIn 1 on app-bar push / pop). The sheet's fill stays solid; only what is on it fades.

fadeParts (data-part names; 'sheetContent' = what is on the sheet): the page's parts that fade through — every other part (fills, the sheet itself) stays solid; empty = the page's content as a whole. slideParts ('sheet'): the sheet slides from the front layer's top to its place (ms, easing). Sample design (app-bar push / pop): fadeParts 'rows bar sheetContent', slideParts 'sheet'; the fade's values are the motion.fadeThrough tokens.

# menu

Overlay menu (OverlaySpec kind menu): a short list of actions — each item { label, icon, action }; picking one runs it and closes the menu. Back or a tap outside closes it.

`openedAt`: the rectangle of the control that opened it, in the app frame (the engine's overlay value; none when opened without one). The popup form hangs below it, its end edge aligned to the control's end edge, `popupGap` under it and at least `popupMinEdge` from the frame's end; the sheet form ignores it.

A surface (extends `surface`): tappable through the inherited `press` event.

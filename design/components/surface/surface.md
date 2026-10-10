# surface

Abstract base of every surface (layers, sheets, bars, dialogs, menus, the peek): an interactive component, so every surface can be tapped (its `press` event) and composition decides later what a tap does. A surface looks the same in every interaction state: no state layer, no ripple, no press scale, no dimming while disabled, the arrow cursor, keyboard focus shown by the focus ring only. A surface that should answer the pointer turns its own back on (peekCard: hover).

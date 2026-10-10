# scrim

The veil over what a layer covers while something sits above it; tapping it sends the layer's own tap (the front layer's: collapse the back layer).

A surface (extends `surface`): tappable through the inherited `press` event. `tone`: `dark` (the colour `color.scrim`) or `wash` (a light veil, `color.scrimWash`, over the partly collapsed front layer). It fades in and out over the duration of the engine's latest change (the DC reads it from the platform's transition, not from design).

The dialog, menu, drawer and side sheet draw their own scrims as a `scrim` visual of their own; this component is the standalone one, reused where a page needs a veil of its own (the front layer now, album pages later).

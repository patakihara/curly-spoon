# snackbar

Non-blocking message at the bottom. Dismisses itself; never captures back or focus.

A surface (extends `surface`): tappable through the inherited `press` event.

Its button reads `action` (the overlay's own text, from config), falling back to `actionLabel` (a design text, fed by the hire); it sends `close`. Button look: `actionEmphasis`, `actionSize` (button options).

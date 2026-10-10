# dialog

Blocking overlay. Traps focus; back closes it before anything else. Use for a decision, with at most two actions.

A surface (extends `surface`): tappable through the inherited `press` event.

Its two buttons read `confirm` / `cancel` (the overlay's own texts, from config) and fall back to `confirmLabel` / `cancelLabel` (design texts, fed by the hire). Each button sends `close` with `ok` or `cancel`; tapping the scrim sends `close` with `cancel`. Button looks: `confirmEmphasis`, `cancelEmphasis` (button emphasis options).

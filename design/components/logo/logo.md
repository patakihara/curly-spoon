# logo

The app mark; opens Dedede. Compact layouts only — on wide layouts the rail has its own entry.

Seven bars on a grid of `unit` (logo.fig: frame 237 × 365, unit 24): each bar 1 unit wide with `barRadius` (½ unit) ends, rest heights `bars` (in units), centred vertically, spread across `frameWidth`. Drawn at the button's `markSize` (height), in its content colour.

While `playing`, the bars run the `levels` motion (level meter, 1–13 units); stopping eases them back to rest. Nothing sets `playing` yet.

Below smallBelow (64px) platforms draw smallImage (assets/logo-small-4x.png, the resting mark rendered at 4× of 28px) tinted with the content colour, instead of the bars; it does not animate.

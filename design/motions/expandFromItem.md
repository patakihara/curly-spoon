# expandFromItem

Detail page push / pop (backdrop pages), one sequence for both directions (platform: `detailTransition`):

1. **Lift** — a copy of the tapped image sits exactly on its visible part (what headers, bars, the peek, the nav bar or the screen edge leave of it). The old content (back layer + front layer content) fades out: `ms × split`, `easingOut`. The front layer surface stays.
2. **Commit** — the new page is rendered; then, measured where everything will rest:
   - the front layer surface moves from its old top to its new one (`ms`, `easing`), visible the whole way;
   - the new content fades in (`ms × (1 − split)`, `easingIn`, from `scaleIn`); on push the back layer parts — header (info), actions (play buttons), basic action (filters) — slide in after it: `enterDelay`, then `enterStagger` apart, each `enterMs` from `enterDistance` below (`enterEasing`);
   - the copy flies to the target image's visible part — position, size, corners and visible part interpolate in one run (`sharedMs`, `sharedEasing`). The real images stay hidden until it lands.

`shared`: 'image' turns the flight on. Pop: the detail image flies back into the item the page was opened from.


The content fade is a fade through (fadeMs, split, easingOut, easingIn, scaleIn — sample design: the motion.fadeThrough tokens). fixedParts: 'stay' — back-header parts found in both headers (same slot + content) stay put (slide if moved) and only the others fade through; 'fadeThrough' — every header part fades through.

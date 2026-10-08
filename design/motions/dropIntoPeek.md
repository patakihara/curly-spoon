# dropIntoPeek

Playing or queueing an item (event `queued`): its image (casting dropShadow while it travels) is copied — formed exactly over the original, same size and corner shape — and thrown from the tap. Its centre follows one path: **straight up** from the original's centre, a **semicircle** as wide as the horizontal distance to the destination (its top is the apex), **straight down** onto the destination's centre. The lines meet the circle tangentially, so the path is smooth and the vertical speed is 0 at the apex. Apex (the tiny square's top), by apex: 'start' riseHeight above the original's top · 'destination' minFallHeight above the destination · 'higher' whichever of those is higher.

The run goes by distance along the path (lines + π·r), eased once (throwEasing — it hits the peek at speed), lasting msPerPx × the path's length. It shrinks into a square the size of the peek's image by the apex (shrinkEasing), clipped by the peek until then; the make-room slides start at the apex.

If the peek was empty (nothing playing), its image appears only once the copy lands. It lands into a destination in the Now playing peek, which springs down and back by `bounce` px (bounceMs).

Destinations by position:
- **now**: onto the peek's image.
- **next**: the peek's title and subtitle slide aside (makeRoomMs) while it falls; it lands beside the image and becomes part of the peek (bouncing with it), stays holdMs, then — the same close as last — slides behind the image while the text slides back, title then subtitle (closeMs, closeEasing, stagger apart); the image covers it and casts tuckShadow on it.
- **last**: all the peek's controls slide aside together (makeRoomMs, controlStagger apart, rightmost first); a cover in the peek's colour rides under the leading control, clipping the text behind; its coverShadow shows only once it actually covers text. The image lands where the last control was, stays holdMs, then the controls slide back over it (closeMs, closeEasing, rightmost first), hidden exactly where the trailing control has reached it, shading its leading edge (shade, shadeWidth; clipped to the image); the cut runs cutOverlap px past the image so no antialiased sliver is left.

The final slides (next: tuck + text back; last: controls back) are one close: holdMs, then closeMs / closeEasing (sample design: long, smooth — start slowly, speed up, come to rest).

Reduced motion: instant.

Keyframe positions and order (all design): the peek's spring peaks at bounceAt of bounceMs; the tuck shadow is on from tuckShadowIn to tuckShadowOut of the tuck; the cover's shadow ramps on over coverShadowRamp of its move; controlOrder 'endFirst' | 'startFirst' — which control moves first (the cover rides with the leading one).

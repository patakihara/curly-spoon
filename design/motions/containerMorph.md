# containerMorph

Container transform: a container's bounds and corner radius animate from one element's to another's (a shared rect from `Measurements.shared` / the morph component's children) while the outgoing content fades out over the first `fadeSplit` and the incoming one fades in. Used by `morph`, the FAB → Now playing open, and media card image → detail image. Reduced motion: fade.

# fadeThrough

Outgoing fades out over split × ms (easingOut); only once it is fully out, incoming fades in over the rest (easingIn) while scaling from scaleIn to 1. Old and new are never shown together.

One look for every fade through in the app: the sample design's rules (deck switch, param swap, sign-out, and the fade inside expandFromItem / expandSurface / sharedAxis) all take their values from the tokens motion.fadeThrough.ms · split · easingOut · easingIn · scaleIn — change those to change every fade through.

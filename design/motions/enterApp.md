# enterApp

A cover (splash, sign-in page) gives way to the app as a fade through, in stages.
1. The cover fades out over ms (easingOut). At the same time its logo stops its loop and moves and shrinks onto the app's logo (logoMs, logoEasing), taking its colour.
2. When the cover has gone, the back-layer content fades in while rising from distance px below (layerMs, easing).
3. stagger later the front layer does the same; another stagger later the navigation (rail from the side, bar from below); peekStagger (default stagger) after that the sheet peek or card.

When the app has no logo on screen, the cover's logo fades with the cover. When the next screen is another cover (launch while signed out), only the logo moves, onto that cover's logo.
Leaving the app for a cover is not this motion: the choreography gives sessionChanged with signedIn false its own rule.

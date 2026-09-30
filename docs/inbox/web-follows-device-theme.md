# The apps follow the device theme; the mockups show both themes

> uhhh there doesn't seem to be any device theme detection on auralis web

> do we not have dark and light versions of each component, based on the theme tokens?

> no idea why that's there; that's stupid.
>
> look, on the app itself, it must come from the system. but on the mockups, it should be mockable, so that i can see both versions!

Asked whether a setting with System, Light and Dark should exist too:

> but this would also be good, regardless

Every Sonora component has dark and light values through its theme tokens, switched by
`data-theme`. Nothing in the web app sets it, so the app is always dark. "That's there" is
Sonora's colour-file rule "never OS/browser sniffing", which goes.

(Sofia, chat with the orchestrator session, 2026-09-30)

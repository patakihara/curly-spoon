# Sonora's buttons and interactive components get Material's states

> Do buttons in the Sonora components have states? They should, and base them on the material guidelines  --- see image above (the agent implementing this must look a this image). The pressed state includes a ripple overlay, which animates from the click position when the button is clicked/pressed. Note: this example shows the pressed state also changing shape: this is not something I'm looking for.
>
> The button components should be set up in such a way that they're in the "disabled" state if they don't have a corresponding action tied to them (or, ofc, if they're "disabled" property is true).
>
> This also applies to all sorts of interactive components.

The image is Material's filled-button states in light and dark: 1 Enabled, 2 Disabled, 3 Hovered,
4 Focused (an outer focus ring), 5 Pressed (a ripple from the press point, plus a shape change she
does not want). It is kept off the public repo, on the laptop at
`~/.claude/state/scratch/auralis-src/inbox-images/material-button-states.webp`.

What exists: Sonora's `Button` has hover (opacity 0.85 and a 1 px lift) and `disabled` (opacity
0.5), no focus ring, no pressed ripple, and a button with no `onClick` still looks enabled.

Why she asks, in a follow-up message:

> And to be clear here, this ask is coming from the fact that the mock Auralis i see on the web has a bunch of buttons that don't do anything, and I shouldn't have to guess which buttons are working

(Sofia, chat with the orchestrator session, 2026-09-30)

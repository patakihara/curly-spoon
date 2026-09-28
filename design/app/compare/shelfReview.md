---
page: shelfReview
pageHash: 30dee8f323ccbc35b67091ba296ffbcade425627b50c6ea0fb7c2b0e9e875c2a
sonora: [none]
---

# Shelf review

Canvas renders: `shelfReview/canvas-phone.png` (390 px) and `shelfReview/canvas-desktop.png`
(1440 px), both in the app shell. No Sonora UI kit screen exists for it (nav.json names `none`);
the page is compared with the Contextual Headers & Controls card (`SectionHeader`'s extended
form: eyebrow, subject art, subject) and the Mini Player, Result Rows & Media Header card, whose
detail rows it uses.

## What the canvas page draws

The heading "Shelf review" led by a close control. In `PageBody` at the list width, one `Section`
per Browse shelf, headed as Browse heads it (eyebrow over the subject, the subject's art, round
for an artist), with "Open" at its end, to that shelf's page. Under it one `ResultRow` per item:
its kind and creator, then its source at the meta's end ("Album · Soul Vertex · ListenBrainz"),
its reason line under that as the row's detail ("Listeners of Deep Inertia play Soul Vertex most
weeks."), and "In library" on the items you own. Three shelves: More like Deep Inertia, Because
you finished The Salt Cartographer, Popular with listeners of The Long Read.

**Empty state**, per nav.json (not drawn): no shelves computed yet, as Sonora's `EmptyState`.

## Differences

- Changed on purpose: a list, not Browse's card carousels, so every reason is readable at once;
  `ResultRow` gained `detail`, a line under the meta that wraps to two lines, for the reason.
- Matches: each shelf's header is the Contextual Headers card's extended `SectionHeader`, eyebrow
  and art over the subject. Changed on purpose: its action is the text "Open", the card's text-action
  form, rather than the arrow, since the row already reads as a list of shelves to open.
- Changed on purpose: the placeholder keeps one bad pick visible, Deep Inertia's own album in
  "More like Deep Inertia", which is what the page is for spotting.
- Changed on purpose: on desktop Settings at the rail's foot stays lit, since Shelf review opens
  from Settings alone and lights nothing of its own.
- Changed on purpose: the page is not a destination, so on the phone the shell shows it under a top app bar (`BackdropShell appBar`): the close control and the title on the page surface, no back layer. The bottom bar and mini-player stay. On desktop it keeps the backdrop.

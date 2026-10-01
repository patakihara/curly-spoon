---
page: queue
pageHash: 96871e13c3a609817dee14a3a0af749f242f56bbf811845ba00c45521c20b9ab
sonora: [kit:mobile/queue, kit:desktop/queue]
spotify: [S36, S37]
---

# Queue

Canvas renders: `queue/canvas-phone.png` (390 px, the sheet on its Queue tab) and
`queue/canvas-desktop.png` (1440 px, the side panel on its Queue tab, drawn over Music). Sonora
renders: `sonora/kit-mobile-queue.png` and `sonora/kit-desktop-queue.png`. Also looked at: Spotify's
S36 (the queue as a sheet over the player: "Queue", "Playing If Books Could Kill", Edit, the playing
row in accent, drag handles, Timer and Speed at its foot) and S37 (the same at full height).

## What the sources show

- **Mobile kit.** A Queue page over the player with a close control: "Playing from" and the book's title beside
  the edit toggle, Now playing, then Up next, rows with a flat accent tile for art.
- **Desktop kit.** The panel's Queue tab: the same rows, the third tab cut to "L…".
- **S36, S37.** Edit turns on selection and reorder; timer and speed sit at the sheet's foot.

## What the canvas page draws

The page is the player's Queue tab, `QueuePage`, which the shell puts in the player, a full-screen
sheet on the phone and the side panel from 1240 px. First the switch between the two queues,
Music and Spoken, the music queue shown and playing; starting the other pauses this one. Then
"Music queue · 6 songs, 28 min" beside the edit toggle. Then Played, what Back walks; Now playing;
Up next with Clear, its first row an episode queued with Play next, marked "Then the spoken queue",
where playback moves over to the spoken queue (the meta-queue), then the spoken items that play
after it. The plan never has music resume on its own: starting one queue pauses the other, so the
rest of the album, queued whole, YouTube Music style, sits under "Waiting in the music queue"; then
Autoplay, "Deep Inertia radio, mixed with similar music you own", for when the music queue runs
out. On desktop the player bar's queue and lyrics buttons open the panel on those tabs; there is
no queue panel of its own.
Edit mode (Sonora's `EditableList`) selects rows, reorders them by drag and removes them, with a
remove bar; nothing leaves the queue unrecoverably, Clear and Remove offering an undo. Rows carry
their cover art.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: the queue is a tab of the player, with no close control of its own, where
  the kit opens it as a page with one.
- Changed on purpose: the two queues, Played, the hand-off mark, the waiting mark, Clear and
  Autoplay are new; the kits and S36 show one queue from now playing on.
- Changed on purpose: rows show cover art, where the kits draw a flat accent tile.
- Changed on purpose: no timer and speed at the foot as in S36; they live on Now playing, speed
  with the spoken transport and music's in the menu.
- Changed on purpose: on desktop the panel's three tabs share its width, labels only, so Lyrics is
  no longer cut off.
- Open: the Clear action uses Sonora's `clear_all` glyph in the section header, not a word; save the
  queue as a playlist and move to top are not drawn, as nav.json's edit mode lists neither.

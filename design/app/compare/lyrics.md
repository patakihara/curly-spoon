---
page: lyrics
pageHash: 5d23f1cb61862e01fd06b046c185046cf108f7c478cce4a12c8b766137f07569
sonora: [kit:mobile/lyrics, kit:desktop/lyrics, card:now-playing-page]
spotify: [S40, S43]
---

# Lyrics

Canvas renders: `lyrics/canvas-phone.png` (390 px, the sheet on its Lyrics tab) and
`lyrics/canvas-desktop.png` (1440 px, the side panel on its Lyrics tab, drawn over Music). Sonora
renders: `sonora/kit-mobile-lyrics.png`, `sonora/kit-desktop-lyrics.png` and
`sonora/card-now-playing-page.png`. Also looked at: Spotify's S43 (lyrics full page: collapse,
song and artist, the lines at one size, share and menu, seek and play docked below) and S40 (the
lyrics card inside the player, expand in its top corner).

## What the sources show

- **Mobile kit.** A Lyrics page with a close control; the song beside the sync control in the top
  corner; synced lines, the current one in rose and larger, those to come muted; the bottom app bar.
- **Now Playing card.** The Lyrics tab with sync off: every line at full strength, a dot on the
  current line.
- **S43.** Lyrics own the surface; the page is dismissed by what opened it.

## What the canvas page draws

The page is the player's Lyrics tab, `LyricsPage`, which the shell puts in the player, a
full-screen sheet on the phone and the side panel from 1240 px. The song, "Heartbeats in Silence ·
Deep Inertia", heads it with the sync toggle always in its top corner. Drawn with sync off: every
line at full opacity, a dot on the current line. Synced, the current line leads in rose and the
list follows the song. The dot itself can be switched off from the player's menu; sync off then
marks nothing. A spoken item has no Lyrics tab. No lyrics found: the tab says so.

## Differences

- Changed on purpose: the lyrics are a tab of the player, with no close control or bottom app bar
  of their own, where the kit opens a page with both.
- Changed on purpose: the sync control is a toggle, sync on or off, where the kit cycled three
  states; the dot's own switch is in the menu, as the plan says.
- Changed on purpose: drawn with sync off, the dot on the current line, to show the plan's rule;
  the kit draws the synced state.
- Changed on purpose: no seek bar or play button docked below as in S43; the phone's sheet sits
  over its tabs and the desktop's player bar carries them.
- Open: the lines are not tinted from the artwork as in S43; the surface is Sonora's.

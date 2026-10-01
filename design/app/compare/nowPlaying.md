---
page: nowPlaying
pageHash: e5de6d38738d8d5c30473ee353daed545a32dd5d1907e4d47cee5eb5bcf830f2
sonora: [kit:mobile/nowplaying, card:now-playing-page]
spotify: [S33, S34, S38, S39, S40, S41, S42]
---

# Now Playing

Canvas renders: `nowPlaying/canvas-phone.png` (390 px, the full-screen sheet) and
`nowPlaying/canvas-desktop.png` (1440 px, the side panel on its Now playing tab, drawn over Music).
Sonora renders: `sonora/kit-mobile-nowplaying.png`, the mobile kit's player, and
`sonora/card-now-playing-page.png`, the Now Playing card, which draws the new player: phones on each
tab, music and spoken, and the desktop panel over the player bar. Also looked at: Spotify's S33 (a
podcast: collapse, "Playing from Podcast", art, title, the spoken transport of speed, skip 15, play,
skip 15, sleep) and S40 (the lyrics card and About the artist below the transport).

## What the sources show

- **Mobile kit.** Collapse, "PLAYING FROM" and the book's title, the menu; art, title, artist and a favourite;
  seek; shuffle, previous, pause, next, repeat; Speed and Sleep timer read-outs; a lyrics preview;
  and a bottom app bar with output, lyrics, queue and more.
- **S33.** Spoken content has its own transport: speed coloured when not 1x, skip back and forward
  by an interval, and the sleep timer, with no shuffle, repeat, previous or next.
- **S40, S41.** The player scrolls on to the lyrics and the artist's own card.

## What the canvas page draws

The page is the player's first tab, `NowPlayingPage`, bound to what shell.json says is loaded;
the shell puts it in Sonora's `NowPlaying`. On the phone that is a full-screen sheet over
everything, the bottom bar and mini-player included, opened from the mini-player: collapse, what it
plays from and the menu, then the tabs Now playing, Queue and Lyrics, then art, title, artist, the
favourite, seek, the music transport and the sleep timer, then "About the artist". Its `variant`
is what is loaded: music here. **Spoken** (a podcast, book or YouTube episode) swaps the transport
for speed, skip back 15, play, skip forward 15 and the sleep timer, never previous or next, and
drops the Lyrics tab; the Now Playing card draws it. On desktop, from 1240 px, the same tab is the
side panel beside the page it opened over, Music here, and the player bar under the window carries
the seek bar and transport; the panel holds art, titles, what it plays from, the favourite, the
sleep timer and the about card. Under 1240 px it is the full-screen sheet. Every page's side
panel is this page, so it binds only what shell.json loads, its sleep timer and about card included.
Speed and the sleep timer open their presets as a menu: on the phone a bottom sheet over the
player, on desktop hanging from the button, as every menu does; the sleep timer's presets include End of
chapter.

## Differences

- Changed on purpose: every Sonora control the page binds no action to is drawn disabled, a
  card or row as much as a button: its ink at 38% and a filled one's container at 12% (Material's
  disabled state). Part C of the states item binds each such control or leaves it deliberately
  disabled.
- Changed on purpose: Queue and Lyrics are tabs of the player, as nav.json has them, where the kit
  shows previews that open full pages and a bottom app bar reaching them; both are gone.
- Changed on purpose: music's speed is not on the page; the plan buries it in the menu. The kit's
  Speed read-out survives only as spoken content's speed control on the transport.
- Changed on purpose: on desktop the panel draws no seek bar or transport, which the player bar
  already carries, where the kit drew both twice.
- Changed on purpose: no output, share or lossless row as in S33 and S40; nav.json's sections are
  art and titles, seek, transport, actions and about cards.
- Changed on purpose: one about card, the artist's; no credits, events or listener counts (S41,
  S42), which a private library does not have.
- Open: the kit's art is square-cornered to the sheet's measure and its title larger; the page
  keeps Sonora's current measure, `--now-playing-art-max`.
- Changed on purpose: a title with a word too wide for the phone's display step, as an episode's
  often is, takes the desktop's step, where the kit would run it under the favourite (the Now
  Playing card shows it).

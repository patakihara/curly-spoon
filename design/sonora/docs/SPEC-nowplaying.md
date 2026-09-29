# Now Playing affordance pass — authoring spec (wave 2)

Second batch: 11 screenshots of Spotify's Now Playing surface, its queue sheet, its lyrics
page and an episode detail page. Same instruction as wave 1 — **affordances, not visual design.**

**Read `docs/SPEC.md` first.** Its "Hard rules", "House idiom" and "Tokens" sections apply
here unchanged and are not repeated. In particular: extensions are strictly additive, nothing
hardcodes a value, siblings are reached through `NS()`, every component gets a `.d.ts`.

## What wave 2 is mostly NOT

Sonora's player is already thorough. `NowPlaying`, `NowPlayingPage`, `PlayerSheet`,
`PlayerPanel`, `PlayerSubPage`, `SeekBar`, `QueuePage`, `QueueRow`, `Lyrics`, `LyricsPage`,
`LyricsSyncButton` and `MiniPlayer` already carry: the sheet that expands out of the mini
player with Now playing, Queue and Lyrics as its tabs, the queue with edit mode and drag
reorder, the lyric sync toggle, and a `footer` slot on every sub-page.

So this wave is small on purpose. Four new components and two extensions. Everything else in
those screenshots either already exists or is deliberately out of scope — see the bottom.

---

# New components

## `media/SpeedControl.jsx`

**Affordance: playback rate as a first-class control, not a settings row.** Spoken-word
listening is rate-shifted by default — the screenshots sit at 1.5× — so the rate has to be
visible and one tap away while playing, and it has to *show its current value*. Sonora has
`ValueRow` ("Speed · 1.0x"), which is a filled settings row on a settings page; this is the
compact inline form that lives in a transport row.

```ts
value?: number          // 1, 1.25, 1.5 … default 1
onClick?: () => void    // opens the rate picker
label?: string          // accessible name; defaults to "Playback speed, <value> times"
size?: number
```

Renders the number plus a small `×`. **Takes `--accent-ink` when `value !== 1` and
`--surface-fg-muted` at 1×** — the point is that a non-default rate is visibly non-default,
because forgetting you left it at 2× is the failure this control exists to prevent.

## `media/AboutCard.jsx`

**Affordance: learn about what you are listening to without leaving the player.** The player
page scrolls, and beneath the transport sits a stack of cards — about the episode, about the
podcast, about the artist. Sonora's player scrolls to lyrics and queue previews and nothing
else, so there is nowhere for an item's own description to live.

```ts
title: string          // the card's own heading — "About the episode"
heading?: string       // the subject's name inside the card
meta?: string          // "8 Aug 2024"
image?: string
round?: boolean        // circular art for a person
body?: string          // prose; rendered through ExpandableText
lines?: number         // clamp before "see more". Default 3
action?: ReactNode     // a FollowButton, typically
badge?: ReactNode      // a Badge — the played check
platform?: 'desktop' | 'mobile'
```

Filled `--surface-card`, `--radius-sm`. Compose `NS().ExpandableText` for `body` and
`NS().CoverArt` for `image` — **the art container needs `position:relative`**, which is the
single most-repeated mistake in wave 1.

## `core/ExpandableText.jsx`

**Affordance: long prose that neither dominates nor hides.** "see more" appears in four
distinct places across these screenshots. Distinct from wave 1's `ExpanderRow`, which folds a
homogeneous *list group*; this folds a *paragraph*, inline, with the control sitting at the end
of the truncated text rather than on its own row.

```ts
children: ReactNode     // or `text`
lines?: number          // clamp. Default 3
moreLabel?: string      // default "see more"
lessLabel?: string      // default "see less"
expanded?: boolean      // controlled; omit to let it keep its own
onToggle?: (next: boolean) => void
```

Clamp with `-webkit-line-clamp`. The toggle is a real `<button>` with `aria-expanded`.

---

# Extensions — additive only

## `media/TransportBar.jsx` + `.d.ts`

**Affordance: spoken-word transport is a different control set, not a relabelled one.** A
podcast or audiobook has no shuffle and no repeat, and "previous track" is close to useless
across a two-hour episode. What it has instead is **skip back / skip forward by a fixed
interval** — the control you actually use, constantly, because you missed a sentence. Wrapping
that in the music cluster would be wrong: these are different verbs for different media, and
Auralis serves both from one player.

Add:
```ts
variant?: 'music' | 'spoken'   // default 'music' — existing behaviour, unchanged
onSkipBack?: () => void
onSkipForward?: () => void
skipSeconds?: number           // default 15; drawn into the glyph label
leading?: ReactNode            // replaces the shuffle end — a SpeedControl, in spoken
trailing?: ReactNode           // replaces the repeat end — a sleep-timer control
```

In `spoken`, prev/next become `replay_10`-style skip glyphs carrying `skipSeconds`, and the
shuffle/repeat ends render `leading`/`trailing` (nothing at all when not supplied). With
`variant` omitted and no slots passed, output must be **byte-identical** to today.

## `media/MediaHeader.jsx` + `.d.ts`

Add:
```ts
actions?: ReactNode        // replaces the default Play / Next / Last cluster entirely
progress?: number | null   // 0–1 resume position; a thin rule under the meta line
```

**Affordance: a detail page whose verbs are not "play, next, last".** A podcast show header
carries Follow, notifications, settings and overflow (wave 1, S02); an episode header carries
saved / downloaded / share / overflow beside a play button (S35). Neither is a queue cluster.
`progress` puts "1h 21m left" and the bar it describes on the same line, which is how a
part-finished episode states itself.

**This was owed from wave 1** — S02 records it as deferred because `MediaHeader.jsx` was not
mirrored at the time. It is mirrored now.

When `actions` is absent the default three buttons render exactly as they do today.

---

# Cards

Same rules as `docs/SPEC.md`'s Cards section — copy `components/basic/buttons.card.html`
literally, `@dsCard` first line, pinned CDN scripts with integrity unchanged, dark+light
`Themed()` wrapper, realistic self-hosted-library content, no Spotify catalogue.

| File | group | name | viewport | Covers |
| --- | --- | --- | --- | --- |
| `components/components/spoken-transport.card.html` | Components | Spoken Transport | 1200x760 | `TransportBar` in both variants, `SpeedControl` at 1× and 1.5× |
| `components/components/about-cards.card.html` | Components | About Cards & Long Text | 1200x820 | `AboutCard` for an episode, a show (with a `FollowButton` action) and a person (`round`), `ExpandableText` collapsed and expanded, `MediaHeader` with a custom `actions` cluster and `progress` |

---

# Deliberately not built

- **Comments, replies and reactions.** A whole social layer — commenter identity, threading,
  emoji reactions, a compose field. Auralis is a self-hosted library with one user; there is
  nobody to comment to. This is the largest thing in the screenshots and the clearest omission.
- **Live events and ticketing.** External commerce against a catalogue Auralis does not have.
- **"#291 in the world" and monthly-listener counts.** Service-scale popularity metrics are
  meaningless for a private library. `Rating` (wave 1) already covers the ratings that a real
  Audiobookshelf or Jellyfin item actually carries.
- **A credits/contributor card.** The affordance — *who made this, and in what role* — is
  already served: `ArtistCard` takes `title` and `sub`, so the role goes in `sub`, laid out by
  `Shelf` under a `Section`. Worth building only if a role-grouped layout is ever wanted.
- **A share sheet.** Platform-provided.
- **Queue sheet, lyrics page, sync modes, edit mode, drag reorder.** `QueuePage`, `QueueRow`,
  `LyricsPage`, `Lyrics` and `LyricsSyncButton` already carry all of it, including the `footer`
  slot the timer/speed row sits in and the `editing` handlers behind the Edit button.
- **Artwork-derived surface tint.** Real, and already parameterised: `PlayerSheet` takes
  `background`, and `--surface-now-playing` is a token. Deriving the value from cover art at
  runtime is app work, not a component.

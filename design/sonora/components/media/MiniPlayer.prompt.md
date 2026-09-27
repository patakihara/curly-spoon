The persistent now-playing surface. One component, two platform variants — use it for the docked player on **both** platforms rather than hand-rolling a desktop player bar.

```jsx
// mobile: tinted pill above the bottom nav
<MiniPlayer title="Heartbeats in Silence" artist="Deep Inertia"
  playing={playing} onTogglePlay={() => setPlaying(!playing)} onOpen={openNowPlaying} />

// desktop: full-width transport bar at the bottom of the window
<MiniPlayer platform="desktop" title="weathergirl" artist="weathergirl · FLAVOR FOLEY"
  playing={playing} onTogglePlay={() => setPlaying(!playing)}
  progress={progress} onSeek={setProgress} duration={258} />
```

Mobile shows title/artist and one play-pause; the tint alone separates it from the page (never a border or shadow). Desktop is a three-column grid — track block, transport + seek bar with mm:ss readouts, then lyrics/queue/volume — separated from the content above by a single `--surface-border` top rule. Pass `queueOpen`/`onToggleQueue` to drive a queue side panel; the queue button tints accent while it is open. Inactive toggles (shuffle, repeat) dim by **opacity**, never by swapping to the muted color — alpha blends correctly over the bar's tint.

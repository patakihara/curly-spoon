/**
 * The persistent Now Playing side panel (docs/DESIGN.md § Layout:
 * "> 1240px — Expanded rail — Persistent side panel"). Rendered only at the
 * `expanded` breakpoint by `Shell.tsx`. `NowPlaying` itself decides it's being
 * embedded (rather than shown as a sheet) once it sees that breakpoint, so this
 * component's only job is the empty state and always passing `open`.
 */
import { NowPlaying } from '../features/player/NowPlaying.js';
import { usePlayerStore } from '../state/playerStore.js';

const noop = () => {};

export function NowPlayingPanel() {
  const currentItem = usePlayerStore((s) => s.currentItem);

  if (!currentItem) {
    return (
      <aside
        className="auralis-now-playing-panel"
        data-testid="now-playing-panel"
        aria-label="Now playing"
      >
        <p className="auralis-now-playing-panel__title">Nothing playing</p>
        <p className="auralis-now-playing-panel__hint">
          Play a book to see chapters, speed, sleep timer and bookmarks here.
        </p>
      </aside>
    );
  }

  return (
    <aside
      className="auralis-now-playing-panel"
      data-testid="now-playing-panel"
      aria-label="Now playing"
    >
      <NowPlaying open onClose={noop} />
    </aside>
  );
}

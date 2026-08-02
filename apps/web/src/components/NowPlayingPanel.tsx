/**
 * Placeholder for the persistent Now Playing side panel (docs/DESIGN.md § Layout:
 * "> 1240px — Expanded rail — Persistent side panel"). Phase 5 replaces this with
 * the real player; this phase's job is only to reserve the region so the
 * expanded layout's proportions are right from the start.
 */
export function NowPlayingPanel() {
  return (
    <aside className="auralis-now-playing-panel" data-testid="now-playing-panel" aria-label="Now playing">
      <p className="auralis-now-playing-panel__title">Nothing playing</p>
      <p className="auralis-now-playing-panel__hint">
        The full player — chapters, speed, sleep timer — arrives in Phase 5.
      </p>
    </aside>
  );
}

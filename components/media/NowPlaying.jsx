import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

if (typeof document !== 'undefined' && !document.getElementById('sonora-nowplaying-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-nowplaying-css';
  el.textContent = '@keyframes np-bar-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'
    + '@media (prefers-reduced-motion:reduce){.np-bar{animation:none!important}}';
  document.head.appendChild(el);
}

/**
 * The player, whole: what is playing, its lyrics and its queue, in the shape each platform wants.
 * Mobile covers everything as a sheet expanding out of the now-playing bar, with lyrics and queue as
 * previews that open full pages (and as buttons on the bottom app bar). Desktop is a side panel where
 * the two are tabs instead. One set of props, both shapes.
 */
export function NowPlaying({
  platform = 'mobile', open = false, from, onClose,
  page, onPageChange, tab, onTabChange,
  track = {}, player = {}, lyrics = {}, queue = {},
  actions, zIndex = 30,
}) {
  const { PlayerSheet, PlayerPanel, NowPlayingPage, LyricsPage, QueuePage, BottomAppBar } = NS();
  const [ownPage, setOwnPage] = React.useState('now');
  const active = page === undefined ? ownPage : page;
  const setPage = (k) => { if (page === undefined) setOwnPage(k); if (onPageChange) onPageChange(k); };
  // Coming back to the bar always returns to the player itself, never to a sub-page.
  React.useEffect(() => { if (!open) setPage('now'); }, [open]); // eslint-disable-line
  // The bottom bar waits for the expansion to land: a docked strip caught inside the growing
  // rectangle reads as a glitch, so it arrives once the sheet is full-size.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    if (!open) { setSettled(false); return; }
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setSettled(true); return; }
    const t = setTimeout(() => setSettled(true), 300);
    return () => clearTimeout(t);
  }, [open]);

  // Which sub-page is on screen, including the one still animating back out, and the rectangle it
  // grows from: the bottom-bar button that opened it, or the preview row whose expand button did.
  const [shown, setShown] = React.useState(null);
  const [origin, setOrigin] = React.useState(null);
  React.useEffect(() => {
    if (active !== 'now') { setShown(active); return; }
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 340);
    return () => clearTimeout(t);
  }, [active]); // eslint-disable-line

  if (platform !== 'mobile') {
    if (!PlayerPanel) return null;
    return <PlayerPanel open={open} tab={tab} onTabChange={onTabChange} onClose={onClose}
      track={track} player={player} lyrics={lyrics} queue={queue} />;
  }

  const openSub = (k, rect) => { setOrigin(rect || null); setPage(k); };
  // From the bottom bar there is nothing to expand out of, so the page just slides up from the edge
  // it was summoned from — and back down when dismissed.
  const go = (k) => () => (active === k ? setPage('now') : openSub(k, null));
  const actionBar = BottomAppBar && (
    <BottomAppBar spread={false} align="end" actions={actions || [
      { key: 'output', icon: 'speaker', label: 'Play on another device' },
      { key: 'lyrics', icon: 'lyrics', label: 'Lyrics', active: active === 'lyrics', onClick: go('lyrics'), disabled: !(lyrics.lines || []).length },
      { key: 'queue', icon: 'queue_music', label: 'Queue', active: active === 'queue', onClick: go('queue') },
      { key: 'more', icon: 'more_vert', label: 'More options', onClick: player.onMore },
    ]} />
  );
  // Its height is held from the start, so nothing reflows when it lands.
  const bar = settled
    ? <div className="np-bar" style={{ flexShrink: 0, animation: 'np-bar-in var(--duration-quick) var(--ease-standard)' }}>{actionBar}</div>
    : <div aria-hidden="true" style={{ flexShrink: 0, height: 'var(--bottom-app-bar-height)' }} />;
  // The sub-page starts below the player's own app bar and stops above the bottom bar, so both
  // stay put while it expands out of whatever was pressed.
  const sub = (kids) => (
    <div style={{ position: 'absolute', top: 'var(--appbar-height-mobile)', left: 0, right: 0, bottom: 0, zIndex: 1, overflow: 'hidden' }}>
      <PlayerSheet open={active !== 'now'} from={origin} radius="var(--radius-md)" zIndex={1}>{kids}</PlayerSheet>
    </div>
  );
  if (!PlayerSheet) return null;
  return (
    <PlayerSheet open={open} from={from} onClose={onClose} zIndex={zIndex} background="var(--surface-bg-alt)">
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {NowPlayingPage && (
          <NowPlayingPage platform="mobile" onClose={onClose} divider={!!shown}
            image={track.image} title={track.title} artist={track.artist} context={track.context}
            lyrics={lyrics.lines} lyricsActiveIndex={lyrics.activeIndex} lyricsSyncMode={lyrics.syncMode}
            onOpenLyrics={(rect) => openSub('lyrics', rect)}
            queue={queue.items} onOpenQueue={(rect) => openSub('queue', rect)} onPlayQueueItem={queue.onPlay}
            {...player} />
        )}
        {shown === 'lyrics' && LyricsPage && sub(
          <LyricsPage platform="mobile" onClose={() => setPage('now')} title={track.title} artist={track.artist} {...lyrics} />
        )}
        {shown === 'queue' && QueuePage && sub(
          <QueuePage platform="mobile" onClose={() => setPage('now')} context={track.context} {...queue} />
        )}
      </div>
      {bar}
    </PlayerSheet>
  );
}

import React from 'react';
import { NS, sx } from '../shared.js';

const TABS = [
  { key: 'now', label: 'Now playing' },
  { key: 'queue', label: 'Queue' },
  { key: 'lyrics', label: 'Lyrics' },
];

/**
 * The player, whole, with Now playing, Queue and Lyrics as its tabs; spoken content has no Lyrics
 * tab. Mobile is a full-screen sheet over everything, the bottom bar included, that expands out
 * of the mini-player: an app bar (collapse, what it plays from, the menu), the tabs, then the
 * active tab's page. Desktop is the side panel. `children` is the active tab's page; left out,
 * the player builds it from `track`, `player`, `queue` and `lyrics`.
 */
export function NowPlaying({
  platform = 'mobile', open = false, from, onClose, onMore,
  tab, onTabChange, variant = 'music',
  track = {}, player = {}, lyrics = {}, queue = {},
  zIndex = 30, children,
}) {
  const { PlayerSheet, PlayerPanel, NowPlayingPage, LyricsPage, QueuePage, TabBar, IconButton, Icon } = NS();
  const mobile = platform === 'mobile';
  const tabs = variant === 'spoken' ? TABS.filter((t) => t.key !== 'lyrics') : TABS;
  const [ownTab, setOwnTab] = React.useState('now');
  const active = tab === undefined ? ownTab : tab;
  // Tabs the player holds itself always switch; tabs a caller holds switch only through its handler.
  const setTab = tab === undefined || onTabChange ? (k) => { if (tab === undefined) setOwnTab(k); if (onTabChange) onTabChange(k); } : undefined;
  const page = children !== undefined ? children
    : active === 'queue' ? QueuePage && <QueuePage platform={platform} heading={null} context={track.context} {...queue} />
    : active === 'lyrics' ? LyricsPage && <LyricsPage platform={platform} heading={null} title={track.title} artist={track.artist} {...lyrics} />
    : NowPlayingPage && <NowPlayingPage platform={platform} variant={variant} image={track.image} title={track.title}
        artist={track.artist} context={track.context} {...player} />;

  if (!mobile) {
    if (!PlayerPanel) return null;
    return <PlayerPanel open={open} tab={active} onTabChange={setTab} onClose={onClose} tabs={tabs}>{page}</PlayerPanel>;
  }
  if (!PlayerSheet) return null;
  return (
    <PlayerSheet open={open} from={from} zIndex={zIndex} background="var(--surface-bg-alt)">
      <div style={sx('display:flex;align-items:center;gap:var(--spacing-sm);flex-shrink:0;box-sizing:border-box;height:var(--appbar-height-mobile);padding:0 var(--spacing-lg)')}>
        {IconButton && <IconButton label="Collapse player" muted onClick={onClose}><Icon name="keyboard_arrow_down" size="md" /></IconButton>}
        <div style={sx('flex:1;min-width:0;text-align:center;font-size:var(--text-xs);letter-spacing:.12em;text-transform:uppercase;font-weight:var(--weight-strong);color:var(--surface-fg-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{track.context}</div>
        {IconButton && <IconButton label="More options" muted onClick={onMore} icon="more_vert" />}
      </div>
      {TabBar && (
        <div style={sx('flex-shrink:0;padding:0 var(--spacing-lg);border-bottom:1px solid var(--surface-border)')}>
          <TabBar platform="mobile" fill items={tabs} value={active} onChange={setTab} />
        </div>
      )}
      <div style={sx('position:relative;display:flex;flex-direction:column;flex:1;min-height:0')}>{page}</div>
    </PlayerSheet>
  );
}

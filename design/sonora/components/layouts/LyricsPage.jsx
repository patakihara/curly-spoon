import React from 'react';
import { NS } from '../shared.js';

/**
 * The player's Lyrics tab: the song on the meta row with the sync toggle in its top corner, over
 * the lyric sheet. Pass `heading={null}` as a tab of the player, whose tab names it.
 */
export function LyricsPage({
  platform = 'mobile', heading = 'Lyrics', title, artist,
  lines = [], activeIndex = 0, syncMode = 'sync', dot = true, onSyncModeChange,
  footer, scroll, onClose,
}) {
  const { PlayerSubPage, Lyrics, LyricsSyncButton } = NS();
  const mobile = platform === 'mobile';
  if (!PlayerSubPage) return null;
  return (
    <PlayerSubPage platform={platform} heading={heading} scroll={scroll} footer={footer} onClose={onClose}
      meta={[title, artist].filter(Boolean).join(' · ')}
      controls={LyricsSyncButton ? <LyricsSyncButton mode={syncMode} dot={dot} onChange={onSyncModeChange} /> : null}>
      {Lyrics && (
        <Lyrics lines={lines} activeIndex={activeIndex} syncMode={syncMode} platform={platform}
          card={false} textSize={mobile ? 'var(--text-2xl)' : 'var(--text-xl)'} />
      )}
    </PlayerSubPage>
  );
}

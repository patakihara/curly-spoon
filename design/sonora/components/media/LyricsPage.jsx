import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * The full lyrics page: the player's sub-page shell, with the song on the meta row beside the sync
 * group, over the lyric sheet. Mobile opens it from the Now Playing preview or the bottom bar;
 * desktop shows it as the player panel's Lyrics tab (pass `heading={null}` and `scroll={false}`).
 */
export function LyricsPage({
  platform = 'mobile', heading = 'Lyrics', title, artist,
  lines = [], activeIndex = 0, syncMode = 'sync', onSyncModeChange,
  footer, scroll = true, onClose,
}) {
  const { PlayerSubPage, Lyrics, LyricsSyncButton } = NS();
  const mobile = platform === 'mobile';
  if (!PlayerSubPage) return null;
  return (
    <PlayerSubPage platform={platform} heading={heading} scroll={scroll} footer={footer} onClose={onClose}
      meta={[title, artist].filter(Boolean).join(' · ')}
      controls={LyricsSyncButton ? <LyricsSyncButton mode={syncMode} onChange={onSyncModeChange} /> : null}>
      {Lyrics && (
        <Lyrics lines={lines} activeIndex={activeIndex} syncMode={syncMode} platform={platform}
          card={false} textSize={mobile ? 'var(--text-2xl)' : 'var(--text-xl)'} />
      )}
    </PlayerSubPage>
  );
}

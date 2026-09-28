import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * Turns the lyric sheet's sync on and off, on the same tonal pill the list/grid toggle uses. Off,
 * the sheet marks the current line with a dot (`dot`), unless the dot is switched off from the
 * player's menu, and then nothing marks it.
 */
export function LyricsSyncButton({ mode = 'sync', dot = true, onChange }) {
  const TonalIconButton = NS().TonalIconButton;
  if (!TonalIconButton) return null;
  const synced = mode === 'sync';
  return (
    <TonalIconButton glyph={synced ? 'sync_lock' : 'sync_disabled'} active={synced}
      label={synced ? 'Lyrics follow the song: turn sync off' : 'Lyrics not synced: turn sync on'}
      onClick={() => onChange && onChange(synced ? (dot ? 'dot' : 'off') : 'sync')} />
  );
}

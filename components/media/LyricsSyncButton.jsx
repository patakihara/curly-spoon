import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

// One control, three states, in the order the button cycles them.
const MODES = ['sync', 'dot', 'off'];
const GLYPH = { sync: 'sync_lock', dot: 'adjust', off: 'sync_disabled' };
const TITLE = {
  sync: 'Lyrics follow the song',
  dot: 'Current line marked only',
  off: 'Lyrics not synced',
};

/**
 * Cycles the lyric sheet between synced, dot-marked and unsynced, on the same tonal pill the
 * list/grid toggle uses — the glyph turns over as the mode changes.
 */
export function LyricsSyncButton({ mode = 'sync', onChange }) {
  const TonalIconButton = NS().TonalIconButton;
  if (!TonalIconButton) return null;
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  return (
    <TonalIconButton glyph={GLYPH[mode]} label={TITLE[mode]}
      onClick={() => onChange && onChange(next)} />
  );
}

import React from 'react';
import { NS, REVEAL, sx } from '../shared.js';

const BTN = (primary, size, height) => sx(
  // Uniform height with narrower side buttons: a pill row rather than three circles.
  'width:' + size + 'px;height:' + height + 'px;border-radius:var(--radius-pill);border:none;flex-shrink:0;cursor:pointer;' +
  'display:inline-flex;align-items:center;justify-content:center;' +
  'box-shadow:var(--shadow-md);' +
  (primary
    ? 'background:var(--play);color:var(--play-contrast)'
    : 'background:color-mix(in srgb, var(--accent) 82%, transparent);color:var(--accent-contrast);backdrop-filter:blur(6px)')
);

/**
 * The three queue actions for a music item: play next, play now, play last. A *disconnected*
 * group — three separate circles, unlike ButtonGroup's connected segments — revealed on hover
 * or keyboard focus of an ancestor carrying the shared `REVEAL.host` class, or always shown.
 */
export function PlayActions({ onNext, onPlay, onLast, playing = false, size = 40, always = false, gap = 'var(--spacing-sm)' }) {
  const { StateLayer, Icon } = NS();
  // Each press stays its own, never reaching the card it sits on; one with no handler is disabled.
  const stop = (fn) => (fn ? (e) => { if (e && e.stopPropagation) e.stopPropagation(); fn(e); } : undefined);
  const act = (label, fn, primary, glyph) => (
    <button className="sn-int sn-filled" aria-label={label} title={label} onClick={stop(fn)} disabled={!fn} style={BTN(primary, primary ? size : size - 6, size)}>
      <Icon name={glyph} size="xs" filled={primary} weight={primary ? 'strong' : 'body'} />
      {StateLayer && <StateLayer disabled={!fn} />}
    </button>
  );
  return (
    <div className={always ? undefined : REVEAL.item} style={sx('display:flex;align-items:center;gap:' + gap)}>
      {act('Play next', onNext, false, 'arrow_top_right')}
      {act(playing ? 'Pause' : 'Play', onPlay, true, playing ? 'pause' : 'play_arrow')}
      {act('Play last', onLast, false, 'last_page')}
    </div>
  );
}

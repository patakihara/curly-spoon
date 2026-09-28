import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

if (typeof document !== 'undefined' && !document.getElementById('sonora-playactions-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-playactions-css';
  // Hover/focus reveal has to be CSS: an inline style cannot express :hover on an ancestor.
  el.textContent = '.sn-acts{opacity:0;transform:translateY(4px);transition:opacity var(--duration-fast) ease,transform var(--duration-fast) ease;pointer-events:none}'
    + '.sn-acts-host:hover .sn-acts,.sn-acts-host:focus-within .sn-acts{opacity:1;transform:none;pointer-events:auto}'
    + '.sn-acts[data-always="true"]:not(.sn-acts-scrim .sn-acts){opacity:1;transform:none;pointer-events:auto}'
    + '.sn-acts-scrim .sn-acts{opacity:inherit;transform:none;pointer-events:inherit}'
    + '.sn-act:hover{filter:brightness(1.12)}';
  document.head.appendChild(el);
}

const BTN = (primary, size, height) => sx(
  // Uniform height with narrower side buttons: a pill row rather than three circles.
  'width:' + size + 'px;height:' + height + 'px;border-radius:var(--radius-pill);border:none;flex-shrink:0;cursor:pointer;' +
  'display:inline-flex;align-items:center;justify-content:center;' +
  "font-family:'Material Symbols Rounded';font-size:" + Math.round(size * 0.5) + 'px;' +
  'box-shadow:var(--shadow-md);transition:filter var(--duration-fast) ease;' +
  (primary
    ? 'background:var(--play);color:var(--play-icon)'
    : 'background:color-mix(in srgb, var(--accent) 82%, transparent);color:var(--accent-contrast);backdrop-filter:blur(6px)')
);

/**
 * The three queue actions for a music item: play next, play now, play last. A *disconnected*
 * group — three separate circles, unlike ButtonGroup's connected segments — revealed on hover
 * or keyboard focus of an ancestor carrying the sn-acts-host class.
 */
export function PlayActions({ onNext, onPlay, onLast, playing = false, size = 40, always = false, gap = 'var(--spacing-sm)' }) {
  const stop = (fn) => (e) => { if (e && e.stopPropagation) e.stopPropagation(); if (fn) fn(e); };
  return (
    <div className="sn-acts" data-always={always ? 'true' : 'false'} style={sx('display:flex;align-items:center;gap:' + gap)}>
      <button className="sn-act" aria-label="Play next" title="Play next" onClick={stop(onNext)} style={BTN(false, size - 6, size)}>arrow_top_right</button>
      <button className="sn-act" aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'} onClick={stop(onPlay)} style={BTN(true, size, size)}>{playing ? 'pause' : 'play_arrow'}</button>
      <button className="sn-act" aria-label="Play last" title="Play last" onClick={stop(onLast)} style={BTN(false, size - 6, size)}>last_page</button>
    </div>
  );
}

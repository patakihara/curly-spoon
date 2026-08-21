import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * States where the audio is going and at what quality — two facts Sonora's player currently
 * states neither. Doubles as the natural home for Auralis's direct-play-vs-transcode distinction,
 * which is otherwise invisible: every session silently takes the transcode path today.
 */
export function OutputDeviceButton({ device, quality, connected = false, glyph = 'speaker', onClick }) {
  const Badge = NS().Badge;
  const muted = 'var(--surface-fg-muted)';
  const ink = connected ? 'var(--accent-ink)' : muted;
  const label = (device ? 'Playing on ' + device : 'Playing on this device') + (quality ? ', ' + quality : '');
  return (
    <button onClick={onClick} aria-label={label} title={label}
      style={sx('display:inline-flex;align-items:center;gap:var(--spacing-sm);border:none;background:transparent;padding:0;cursor:pointer;color:' + ink + ';transition:color var(--duration-fast) var(--ease-standard)')}>
      <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-sm);line-height:1;font-variation-settings:'FILL' " + (connected ? 1 : 0) + ",'wght' 500")}>{glyph}</span>
      {device && <span style={sx('font-size:var(--text-sm);font-weight:700;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{device}</span>}
      {quality && Badge && <Badge tone="neutral" plain>{quality}</Badge>}
    </button>
  );
}

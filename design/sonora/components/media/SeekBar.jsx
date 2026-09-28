import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

/** Seek slider with elapsed and remaining readouts beneath it. */
export function SeekBar({ value = 0, duration = 0, platform = 'mobile', onChange, remainingAsCountdown = true }) {
  const Slider = NS().Slider;
  const secs = Math.max(0, Math.min(1, value)) * duration;
  return (
    <div style={sx('display:flex;flex-direction:column;gap:var(--spacing-sm);width:100%')}>
      {Slider && <Slider value={value} onChange={onChange} platform={platform} tone="play" />}
      <div style={sx('display:flex;justify-content:space-between;font-size:var(--text-sm);color:var(--surface-fg-muted)')}>
        <span>{mmss(secs)}</span>
        <span>{(remainingAsCountdown ? '-' : '') + mmss(remainingAsCountdown ? duration - secs : duration)}</span>
      </div>
    </div>
  );
}

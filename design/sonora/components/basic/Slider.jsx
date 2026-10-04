import React from 'react';
import { NS, clamp01, percentOf } from '../shared.js';


export function Slider({ value = 0.3, onChange, platform = 'desktop', tone = 'accent' }) {
  const StateLayer = NS().StateLayer;
  const ref = React.useRef(null);
  const off = !onChange;
  const seek = (e) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onChange(clamp01((e.clientX - rect.left) / rect.width));
  };
  const step = (e) => {
    const to = { ArrowRight: value + 0.05, ArrowUp: value + 0.05, ArrowLeft: value - 0.05, ArrowDown: value - 0.05, Home: 0, End: 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onChange(clamp01(to));
  };
  const isMobile = platform === 'mobile';
  // Disabled, the fill and the handle take the content colour, which the state layer sets to 38%.
  const fill = off ? 'currentColor' : tone === 'play' ? 'var(--play)' : 'var(--accent)';
  return (
    <div ref={ref} className="sn-int sn-filled" role="slider" aria-valuemin={0} aria-valuemax={1} aria-valuenow={value}
      tabIndex={off ? -1 : 0} aria-disabled={off}
      onClick={off ? undefined : seek} onKeyDown={off ? undefined : step}
      style={{
        position: 'relative', width: '100%', height: isMobile ? 8 : 4, borderRadius: 999, cursor: 'pointer',
        background: isMobile ? 'var(--surface-card)' : 'var(--surface-border)',
      }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%', width: percentOf(value),
        borderRadius: 999, background: fill,
      }} />
      {isMobile && (
        <div style={{
          position: 'absolute', top: '50%', left: percentOf(value), transform: 'translate(-50%,-50%)',
          width: 2, height: 20, borderRadius: 2, background: off ? 'currentColor' : 'var(--surface-bg)',
        }} />
      )}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: '50%', left: percentOf(value), transform: 'translate(-50%,-50%)',
          width: 12, height: 12, borderRadius: '50%', background: off ? 'currentColor' : '#fff', boxShadow: 'var(--shadow-sm)',
        }} />
      )}
      {/* The state shows on a halo round the handle, as Material's slider draws it. */}
      <span style={{
        position: 'absolute', top: '50%', left: percentOf(value), transform: 'translate(-50%,-50%)',
        width: 32, height: 32, borderRadius: '50%', pointerEvents: 'none', color: 'var(--surface-fg)',
      }}>
        {StateLayer && <StateLayer disabled={off} ripple={false} />}
      </span>
    </div>
  );
}

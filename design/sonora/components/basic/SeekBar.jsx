import React from 'react';
import { NS, clamp01, formatTime, sx } from '../shared.js';


/**
 * Seek slider with its time readouts: elapsed and remaining beneath it, elapsed and total length
 * beneath it, or elapsed and total length either side of it on one row.
 */
export function SeekBar({ value = 0, duration = 0, platform = 'mobile', onChange, readout = 'remaining' }) {
  const Slider = NS().Slider;
  const secs = clamp01(value) * duration;
  const slider = Slider && <Slider value={value} onChange={onChange} platform={platform} tone="play" label="Seek" valueText={formatTime(secs) + ' of ' + formatTime(duration)} />;
  if (readout === 'inline') {
    // Each readout holds at least the m:ss width, so the slider stays put as digits change, and
    // grows rather than clips for an hour or more; tabular digits keep it still as seconds tick.
    const time = (t) => <span style={sx('flex-shrink:0;min-width:var(--time-readout-width);white-space:nowrap;font-variant-numeric:tabular-nums;font-size:var(--text-xs);color:var(--surface-fg-muted)')}>{formatTime(t)}</span>;
    return (
      <div style={sx('display:flex;align-items:center;gap:var(--spacing-sm);width:100%')}>
        {time(secs)}
        <div style={sx('flex:1;display:flex')}>{slider}</div>
        {time(duration)}
      </div>
    );
  }
  const countdown = readout === 'remaining';
  return (
    <div style={sx('display:flex;flex-direction:column;gap:var(--spacing-sm);width:100%')}>
      {slider}
      <div style={sx('display:flex;justify-content:space-between;font-size:var(--text-sm);color:var(--surface-fg-muted)')}>
        <span>{formatTime(secs)}</span>
        <span>{(countdown ? '-' : '') + formatTime(countdown ? duration - secs : duration)}</span>
      </div>
    </div>
  );
}

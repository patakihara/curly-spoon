import React from 'react';

export function Slider({ value = 0.3, onChange, platform = 'desktop' }) {
  const ref = React.useRef(null);
  const seek = (e) => {
    if (!ref.current || !onChange) return;
    const rect = ref.current.getBoundingClientRect();
    onChange(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  };
  const isMobile = platform === 'mobile';
  return (
    <div ref={ref} onClick={seek} style={{
      position: 'relative', width: '100%', height: isMobile ? 8 : 4, borderRadius: 999, cursor: 'pointer',
      background: isMobile ? 'var(--m3-surface-variant)' : 'var(--surface-border)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, height: '100%', width: `${value * 100}%`,
        borderRadius: 999, background: 'var(--accent)',
      }} />
      {isMobile && (
        <div style={{
          position: 'absolute', top: '50%', left: `${value * 100}%`, transform: 'translate(-50%,-50%)',
          width: 2, height: 20, borderRadius: 2, background: 'var(--m3-background)',
        }} />
      )}
      {!isMobile && (
        <div style={{
          position: 'absolute', top: '50%', left: `${value * 100}%`, transform: 'translate(-50%,-50%)',
          width: 12, height: 12, borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-sm)',
        }} />
      )}
    </div>
  );
}

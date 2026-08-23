import React from 'react';

export function AlbumArt({ src, size = 160, platform = 'desktop' }) {
  const radius = 'var(--radius-lg)';
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0,
      background: src ? undefined : `linear-gradient(135deg, var(--accent), var(--accent-violet))`,
      boxShadow: 'var(--shadow-md)',
    }}>
      {src && <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  );
}

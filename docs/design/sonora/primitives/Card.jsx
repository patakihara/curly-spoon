import React from 'react';

export function Card({ image, title, subtitle, badge, platform = 'desktop', width, onClick }) {
  const radius = 'var(--radius-md)';
  const cardWidth = width ?? 160;
  const [hover, setHover] = React.useState(false);
  return (
    <div onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{
      display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer', width: cardWidth, flexShrink: 0,
      transform: hover ? 'translateY(-2px)' : 'none', transition: 'transform 0.15s ease',
    }}>
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '1', borderRadius: radius, overflow: 'hidden',
        background: `linear-gradient(135deg, var(--accent), var(--accent-violet))`,
      }}>
        {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
        {badge != null && (
          <span style={{
            position: 'absolute', top: 8, right: 8, background: 'var(--accent)', color: '#fff',
            fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-pill)',
          }}>{badge}</span>
        )}
      </div>
      <div>
        <div style={{ color: 'var(--m3-on-background)', fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ color: 'var(--m3-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
      </div>
    </div>
  );
}

import React from 'react';

export function IconButton({ children, size = 36, active, muted, onClick, label }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, borderRadius: '50%', border: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'rgb(255 255 255 / 10%)' : 'transparent',
        color: active ? 'var(--accent)' : muted ? 'var(--surface-fg-muted)' : 'var(--surface-fg)',
        cursor: 'pointer', transition: 'background 0.15s ease, color 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

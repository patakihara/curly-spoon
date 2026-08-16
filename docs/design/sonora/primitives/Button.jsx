import React from 'react';

const sizes = {
  sm: { padding: '0 12px', height: 30, fontSize: 'var(--text-sm)' },
  md: { padding: '0 16px', height: 36, fontSize: 'var(--text-md)' },
  lg: { padding: '0 20px', height: 44, fontSize: 'var(--text-lg)' },
};

const variantStyle = (variant, platform) => {
  const radius = 'var(--radius-pill)';
  if (variant === 'primary') return { background: 'var(--accent)', color: 'var(--accent-contrast)', border: '1px solid transparent', borderRadius: radius };
  if (variant === 'secondary') return { background: 'var(--surface-card)', color: 'var(--surface-fg)', border: '1px solid var(--surface-border)', borderRadius: radius };
  if (variant === 'ghost') return { background: 'transparent', color: 'var(--surface-fg)', border: '1px solid transparent', borderRadius: radius };
  if (variant === 'danger') return { background: 'var(--state-error)', color: '#fff', border: '1px solid transparent', borderRadius: radius };
  return {};
};

export function Button({ children, variant = 'primary', size = 'md', platform = 'desktop', icon, disabled, onClick }) {
  const [hover, setHover] = React.useState(false);
  const sizeStyle = sizes[size] || sizes.md;
  const vStyle = variantStyle(variant, platform);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'var(--font-body)', fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : hover ? 0.85 : 1,
        transition: 'opacity 0.15s ease-in-out, transform 0.1s ease',
        transform: hover && !disabled ? 'translateY(-1px)' : 'none',
        ...sizeStyle, ...vStyle,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

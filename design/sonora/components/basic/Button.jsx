import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

const sizes = {
  sm: { padding: '0 var(--spacing-md)', height: 30, fontSize: 'var(--text-sm)' },
  md: { padding: '0 var(--spacing-lg)', height: 36, fontSize: 'var(--text-md)' },
  lg: { padding: '0 var(--spacing-xl)', height: 44, fontSize: 'var(--text-lg)' },
};

const variantStyle = (variant, platform) => {
  const radius = 'var(--radius-pill)';
  if (variant === 'primary') return { background: 'var(--accent)', color: 'var(--accent-contrast)', border: '1px solid transparent', borderRadius: radius };
  if (variant === 'play') return { background: 'var(--play)', color: 'var(--play-contrast)', border: '1px solid transparent', borderRadius: radius };
  if (variant === 'secondary') return { background: 'var(--surface-card)', color: 'var(--surface-fg)', border: '1px solid var(--surface-border)', borderRadius: radius };
  if (variant === 'ghost') return { background: 'transparent', color: 'var(--surface-fg)', border: '1px solid transparent', borderRadius: radius };
  if (variant === 'danger') return { background: 'var(--state-error)', color: '#fff', border: '1px solid transparent', borderRadius: radius };
  return {};
};

export function Button({ children, variant = 'primary', size = 'md', platform = 'desktop', icon, disabled, onClick, pressed }) {
  const StateLayer = NS().StateLayer;
  // No action is no button: without onClick it is drawn disabled, as with `disabled` set.
  const off = !!disabled || !onClick;
  const sizeStyle = sizes[size] || sizes.md;
  const vStyle = variantStyle(variant, platform);
  return (
    <button
      className={'sn-int' + (variant === 'ghost' ? '' : ' sn-filled')}
      onClick={off ? undefined : onClick}
      disabled={off}
      // A toggle whose label states the state rather than the action ("Following") is a pressed
      // control, not a plain one, and only the real element can carry that. Undefined leaves the
      // attribute off entirely, so an ordinary Button is unchanged.
      aria-pressed={pressed}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-sm)',
        fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-medium)', cursor: 'pointer',
        ...sizeStyle, ...vStyle,
      }}
    >
      {icon}
      {children}
      {StateLayer && <StateLayer disabled={off} />}
    </button>
  );
}

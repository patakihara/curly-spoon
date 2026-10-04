import React from 'react';
import { NS, injectCss, sx, tokenMs } from '../shared.js';

// A tonal button's glyph turns over rather than blinking: the outgoing one rotates and fades out,
// the incoming one rotates in.
injectCss('sonora-iconbutton-css', '@keyframes sn-glyph-in{from{opacity:0;transform:rotate(-45deg) scale(.7)}to{opacity:1;transform:none}}'
    + '@keyframes sn-glyph-out{from{opacity:1;transform:none}to{opacity:0;transform:rotate(45deg) scale(.7)}}'
    + '@media (prefers-reduced-motion:reduce){.sn-glyph{animation:none!important}}');

const ACTIVE = { accent: 'var(--accent)', play: 'var(--play)', library: 'var(--tone-library)', inherit: 'inherit' };

// Each look's container. A filled one dims to the disabled container colour.
const LOOK = {
  plain: { fill: 'transparent' },
  outline: { fill: 'transparent', css: 'border:var(--hairline) solid var(--surface-border)' },
  tonal: { fill: 'var(--surface-card)', filled: true },
  raised: { fill: 'var(--surface-card)', filled: true, css: 'box-shadow:var(--shadow-md)' },
  scrim: { fill: 'var(--scrim-soft)', filled: true },
};

/**
 * Sonora's one icon-only button. `variant` picks its container: plain (none), outline (a hairline
 * ring), tonal (a squat pill on the card fill whose glyph turns over as it changes), raised (the
 * card fill with a shadow, over content) or scrim (over artwork). `size` is a step of the control
 * ramp. `label` is always its accessible name.
 */
export function IconButton({
  children, icon, iconSize, variant = 'plain', size, active, muted, tone = 'accent', onClick, label,
  disabled, title, pressed, expanded, controls, className, style,
}) {
  const { StateLayer, Icon } = NS();
  const off = !!disabled || !onClick;
  const tonal = variant === 'tonal';
  const look = LOOK[variant] || LOOK.plain;
  const step = size || (tonal ? 'xs' : 'sm');
  const ink = variant === 'scrim' ? 'var(--on-scrim)'
    : active ? (tonal ? 'var(--accent-ink)' : ACTIVE[tone] || ACTIVE.accent)
    : tone === 'inherit' ? 'inherit'
    : muted ? 'var(--surface-fg-muted)' : 'var(--surface-fg)';
  // A tonal glyph keeps the outgoing name mounted for one animation, so the two cross over.
  const ref = React.useRef(null);
  const [pair, setPair] = React.useState({ current: icon, prev: null });
  React.useEffect(() => {
    if (!tonal || icon === pair.current) return undefined;
    setPair((p) => ({ current: icon, prev: p.current }));
    const t = setTimeout(() => setPair((p) => ({ current: p.current, prev: null })), tokenMs(ref.current, '--duration-quick'));
    return () => clearTimeout(t);
  }, [icon, tonal]); // eslint-disable-line
  const glyph = (name, out) => (
    <Icon key={name + (out ? '-out' : '')} name={name} size={iconSize || (tonal ? 'xs' : 'sm')}
      filled={tonal && !!active} weight={tonal && active ? 'strong' : 'body'}
      className={tonal ? 'sn-glyph' : undefined}
      style={tonal ? sx('position:absolute;animation:sn-glyph-' + (out ? 'out' : 'in') + ' var(--duration-quick) var(--ease-standard) both') : undefined} />
  );
  const face = !icon ? children
    : tonal ? (
      // The turning glyphs are clipped here rather than on the button, whose focus ring lies outside it.
      <span style={sx('position:absolute;inset:0;overflow:hidden;border-radius:inherit;display:flex;align-items:center;justify-content:center')}>
        {pair.prev && pair.prev !== icon && glyph(pair.prev, true)}
        {glyph(icon, false)}
      </span>
    ) : glyph(icon, false);
  return (
    <button
      ref={ref}
      className={'sn-int' + (look.filled ? ' sn-filled' : '') + (className ? ' ' + className : '')}
      onClick={off ? undefined : onClick}
      disabled={off}
      aria-label={label}
      title={title}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      style={{
        ...sx('position:relative;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;cursor:pointer;' +
          'height:var(--control-' + step + ');' +
          'width:' + (tonal ? 'calc(var(--control-' + step + ') + var(--spacing-sm))' : 'var(--control-' + step + ')') + ';' +
          'border-radius:' + (tonal ? 'var(--radius-pill)' : 'var(--radius-round)') + ';' +
          'background:' + look.fill + ';' + (look.css ? look.css + ';' : '') +
          'color:' + ink + ';' +
          'transition:background var(--duration-fast) var(--ease-standard),color var(--duration-fast) var(--ease-standard)'),
        ...style,
      }}
    >
      {face}
      {StateLayer && <StateLayer disabled={off} />}
    </button>
  );
}

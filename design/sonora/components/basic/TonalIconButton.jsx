import React from 'react';
import { NS, injectCss, sx } from '../shared.js';

// The glyph turns over rather than blinking: outgoing rotates and fades out, incoming rotates in.
injectCss('sonora-tonalicon-css', '@keyframes ti-in{from{opacity:0;transform:rotate(-45deg) scale(.7)}to{opacity:1;transform:none}}'
    + '@keyframes ti-out{from{opacity:1;transform:none}to{opacity:0;transform:rotate(45deg) scale(.7)}}'
    + '@media (prefers-reduced-motion:reduce){.ti-glyph{animation:none!important}}');

/**
 * Icon button on a tonal (card) fill: a squat pill rather than a circle, for controls that sit on the
 * page rather than in a bar — the list/grid switch above a collection. Swapping `glyph` turns the icon
 * over instead of cutting to it.
 */
export function TonalIconButton({
  glyph, label, onClick, width = 40, height = 32, radius = '16px',
  iconSize = 'var(--icon-xs)', active = false, background = 'var(--surface-card)', disabled = false,
}) {
  const StateLayer = NS().StateLayer;
  const off = !!disabled || !onClick;
  // Keep the outgoing glyph mounted for one animation so the two can cross over.
  const [pair, setPair] = React.useState({ current: glyph, prev: null });
  React.useEffect(() => {
    if (glyph === pair.current) return;
    setPair((p) => ({ current: glyph, prev: p.current }));
    const t = setTimeout(() => setPair((p) => ({ current: p.current, prev: null })), 220);
    return () => clearTimeout(t);
  }, [glyph]); // eslint-disable-line
  const face = (name, out) => (
    <span key={name + (out ? '-out' : '')} className="ti-glyph" aria-hidden="true"
      style={sx("position:absolute;font-family:'Material Symbols Rounded';font-size:" + iconSize + ';line-height:1;' +
        "font-variation-settings:'FILL' " + (active ? 1 : 0) + ",'wght' " + (active ? 500 : 400) + ';' +
        'animation:ti-' + (out ? 'out' : 'in') + ' var(--duration-quick) var(--ease-standard) both')}>{name}</span>
  );
  return (
    <button className="sn-int sn-filled" onClick={off ? undefined : onClick} disabled={off} aria-label={label} title={label}
      style={sx('position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;border:none;' +
        'width:' + width + 'px;height:' + height + 'px;border-radius:' + radius + ';background:' + background + ';' +
        'transition:background var(--duration-fast) ease,color var(--duration-fast) ease;' +
        'color:' + (active ? 'var(--accent-ink)' : 'var(--surface-fg)'))}>
      {/* The turning glyphs are clipped here rather than on the button, whose focus ring lies
          outside it. */}
      <span style={sx('position:absolute;inset:0;overflow:hidden;border-radius:inherit;display:flex;align-items:center;justify-content:center')}>
        {pair.prev && face(pair.prev, true)}
        {face(pair.current, false)}
      </span>
      {StateLayer && <StateLayer disabled={off} />}
    </button>
  );
}

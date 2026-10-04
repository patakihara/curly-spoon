import React from 'react';
import { NS, activate, sx } from '../shared.js';
// Enter and Space press it as a click does, unless they come from a control inside it.

/** Continue-listening / jump-back-in row tile: small square art plus two lines. Replaces the old QuickTile. */
export function QuickPick({ title, sub, platform = 'desktop', icon, image, onClick, progress = null, unplayed = false }) {
  const mobile = platform === 'mobile';
  const { CoverArt, StateLayer, Icon, ProgressBar } = NS();
  const off = !onClick;
  const size = 52;
  const hasProgress = typeof progress === 'number';
  // `icon` swaps the artwork square for an Icon glyph on a flat accent tint — for
  // destinations that have no cover art of their own (Shuffle, Downloads, Liked, a genre).
  // Resume/new-episode state is a property of real cover art, not of a utility glyph tile, so
  // `progress`/`unplayed` only ever decorate the image branch below.
  const leading = icon
    ? <div style={sx('width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;background:color-mix(in oklch, var(--surface-card) 76%, var(--accent));color:var(--accent-ink)')}>
        <Icon name={icon} filled weight="strong" />
      </div>
    : <div style={sx('position:relative;overflow:hidden;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:8px')}>
        {CoverArt && <CoverArt src={image} />}
        {unplayed && <div aria-hidden="true" style={sx('position:absolute;top:4px;right:4px;width:8px;height:8px;border-radius:50%;background:var(--accent)')} />}
        {hasProgress && (
          <ProgressBar value={progress} tone="scrim" label="Played" style={sx('position:absolute;left:0;right:0;bottom:0')} />
        )}
      </div>;
  return (
    <div className="sn-int" role="button" tabIndex={off ? -1 : 0} aria-disabled={off}
      onClick={off ? undefined : onClick} onKeyDown={off ? undefined : activate(onClick)}
      style={sx('display:flex;align-items:center;gap:var(--spacing-md);border-radius:var(--radius-xs);cursor:pointer;min-width:0;background:var(--surface-card)')}>
      {leading}
      <div style={sx('min-width:0;display:flex;flex-direction:column;gap:2px;margin-right:var(--spacing-md)')}>
        <div style={sx('font-size:var(--text-' + (mobile ? 'sm' : 'md') + ');font-weight:var(--weight-strong);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--surface-fg)')}>{title}</div>
        <div style={sx('font-size:var(--text-sm);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--surface-fg-muted)')}>{sub}</div>
      </div>
      {StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}

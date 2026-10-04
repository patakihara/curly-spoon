import React from 'react';
import { NS, sx } from '../shared.js';

/**
 * Argues for one item, at length, inside a feed — the most-repeated shape in the Spotify
 * screenshots, and one MediaCard and ResultRow can't carry: neither has room for a description,
 * and the description is the point, since this is a recommendation that has to persuade. Tinted
 * from its own artwork, so a column of these reads as distinct recommendations, not a list.
 */
export function FeatureCard({ image, kind, title, meta, description, tint, explicit = false, saved = false, onSave, onPlay, onMore, preview, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const { CoverArt, Badge, IconButton, StateLayer, Icon } = NS();
  const kindLabel = kind ? kind.toLowerCase() : 'item';
  const saveLabel = saved ? 'Remove from saved' : 'Save ' + kindLabel;
  const playLabel = 'Play ' + kindLabel;
  return (
    <div style={sx('position:relative;display:flex;flex-direction:column;gap:var(--spacing-sm);padding:var(--spacing-md);border-radius:var(--radius-md);background:' + (tint || 'var(--surface-card)'))}>
      {onMore && IconButton && (
        <IconButton size="xs" muted label="More options" title="More options" onClick={onMore}
          style={sx('position:absolute;top:var(--spacing-sm);right:var(--spacing-sm)')}>
          <Icon name="more_vert" weight="strong" />
        </IconButton>
      )}
      <div style={sx('display:flex;gap:var(--spacing-md);padding-right:' + (onMore ? 'var(--control-xs)' : '0'))}>
        {/* position:relative is load-bearing, not tidiness: CoverArt fills its parent with
            position:absolute;inset:0, so without a positioned ancestor here the gradient escapes
            and covers the whole card, hiding every line of text under it. */}
        <div style={sx('position:relative;flex-shrink:0;width:' + (mobile ? '76px' : '92px') + ';height:' + (mobile ? '76px' : '92px') + ';border-radius:var(--radius-xs);overflow:hidden')}>
          {CoverArt && <CoverArt src={image} />}
        </div>
        <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;justify-content:center')}>
          {kind && <div style={sx('font-size:var(--text-xs);font-weight:var(--weight-strong);color:' + muted + ';text-transform:uppercase;letter-spacing:.02em')}>{kind}</div>}
          <div style={sx('display:flex;align-items:baseline;gap:6px;min-width:0')}>
            {/* Explicit qualifies the content rather than counting anything, which is what Badge's
                square, uncounted form exists for. Announced, not hidden — someone choosing an
                episode by ear needs this as much as someone choosing it by eye. */}
            {explicit && Badge && (
              <span role="img" aria-label="Explicit" style={sx('flex-shrink:0;display:inline-flex')}>
                <Badge tone="neutral" square>E</Badge>
              </span>
            )}
            <div style={sx('flex:1;min-width:0;font-size:var(--text-lg);font-weight:var(--weight-strong);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + fg)}>{title}</div>
          </div>
          {meta && <div style={sx('font-size:var(--text-sm);color:' + muted + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{meta}</div>}
        </div>
      </div>
      {description && (
        <div style={sx('font-size:var(--text-sm);line-height:1.4;color:' + muted + ';display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden')}>{description}</div>
      )}
      <div style={sx('display:flex;align-items:center;gap:var(--spacing-sm);margin-top:var(--spacing-xs)')}>
        {preview}
        <div style={sx('display:flex;align-items:center;gap:var(--spacing-sm);margin-left:auto')}>
          {onSave && IconButton && (
            <IconButton muted active={saved} tone="library" pressed={saved} label={saveLabel} title={saveLabel} onClick={onSave}>
              <Icon name="bookmark" filled={saved} weight="strong" />
            </IconButton>
          )}
          {/* Omitted for an audiobook: a sample is the only playback a preview offers there. */}
          {onPlay && (
            <button className="sn-int sn-filled" onClick={onPlay} aria-label={playLabel} title={playLabel}
              style={sx('display:flex;align-items:center;justify-content:center;width:var(--control-sm);height:var(--control-sm);flex-shrink:0;border-radius:var(--radius-round);border:none;background:var(--play);color:var(--play-contrast);cursor:pointer')}>
              <Icon name="play_arrow" filled weight="strong" />
              {StateLayer && <StateLayer />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

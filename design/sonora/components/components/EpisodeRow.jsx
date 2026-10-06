import React from 'react';
import { NS, sx } from '../shared.js';

/**
 * List row for serial spoken-word content — an episode is not a track: it carries a synopsis you
 * need in order to choose, a publication date, a listened/finished state, and its own download.
 * A sibling of ResultRow rather than an extension of it, so the track and request lists ResultRow
 * already serves stay untouched. `absent` greys an episode of a show you don't follow.
 */
export function EpisodeRow({ image, title, description, meta, finished = false, progress = null, explicit = false, absent = false, actions, onPlay, onClick, divider = false, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const { Badge, Icon, ListRow, ProgressBar } = NS();
  const hasProgress = typeof progress === 'number';
  const metaLine = meta && meta.filter(Boolean).join(' • ');
  return ListRow ? (
    <ListRow platform={platform} density="roomy" align="start" onClick={onClick} disabled={!onClick} divider={divider}
      image={image} artSize={mobile ? 'md' : 'lg'} artGrey={absent} onArt={onPlay} artLabel="Play episode">
      <div style={sx('display:flex;flex-direction:column;gap:4px')}>
        <div style={sx('display:flex;align-items:baseline;gap:6px;min-width:0')}>
          {/* Same square, uncounted Badge the feature card uses — one marker, one implementation. */}
          {explicit && Badge && (
            <span role="img" aria-label="Explicit" style={sx('flex-shrink:0;display:inline-flex')}>
              <Badge tone="neutral" square>E</Badge>
            </span>
          )}
          <div style={sx('flex:1;min-width:0;font-size:var(--text-md);font-weight:var(--weight-strong);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + (absent ? muted : fg))}>{title}</div>
        </div>
        {metaLine && (
          <div style={sx('display:flex;align-items:center;gap:6px;font-size:var(--text-sm);color:' + muted + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>
            <span style={sx('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{metaLine}</span>
            {finished && (
              // A filled check in --tone-library rather than a second pill — this is a state of
              // the episode, not another badge competing with the status pills elsewhere.
              <span style={sx('flex-shrink:0;display:inline-flex;align-items:center;gap:2px;color:var(--tone-library);font-weight:var(--weight-strong)')}>
                <Icon name="check_circle" size="xs" filled weight="strong" />
                Finished
              </span>
            )}
          </div>
        )}
        {hasProgress && (
          <ProgressBar value={progress} label="Played" style={sx('width:100%;max-width:var(--progress-max-width)')} />
        )}
        {description && (
          <div style={sx('font-size:var(--text-sm);line-height:1.4;color:' + muted + ';display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden')}>{description}</div>
        )}
        {/* A press between its actions stays there, as one on an action does. */}
        {actions && <div data-sn-own-press="" style={sx('margin-top:4px')}>{actions}</div>}
      </div>
    </ListRow>
  ) : null;
}

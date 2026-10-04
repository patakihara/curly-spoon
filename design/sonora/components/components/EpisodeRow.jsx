import React from 'react';
import { NS, REVEAL, activate, clamp01, percentOf, sx } from '../shared.js';
// Enter and Space press it as a click does, unless they come from a control inside it.

/**
 * List row for serial spoken-word content — an episode is not a track: it carries a synopsis you
 * need in order to choose, a publication date, a listened/finished state, and its own download.
 * A sibling of ResultRow rather than an extension of it, so the track and request lists ResultRow
 * already serves stay untouched. `absent` greys an episode of a show you don't follow.
 */
export function EpisodeRow({ image, title, description, meta, finished = false, progress = null, explicit = false, absent = false, actions, onPlay, onClick, divider = false, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const { CoverArt, Badge, StateLayer, Icon } = NS();
  const off = !onClick;
  const art = mobile ? 56 : 64;
  const hasProgress = typeof progress === 'number';
  const pct = hasProgress ? clamp01(progress) : 0;
  const metaLine = meta && meta.filter(Boolean).join(' • ');
  return (
    <div className="sn-int" role="button" tabIndex={off ? -1 : 0} aria-disabled={off}
      onClick={off ? undefined : onClick} onKeyDown={off ? undefined : activate(onClick)}
      style={sx('position:relative;display:flex;gap:' + (mobile ? '12px' : '16px') + ';padding:' + (mobile ? '10px 4px' : '12px') + ';border-radius:var(--radius-xs);cursor:pointer')}>
      <div className={REVEAL.host} data-always={mobile ? 'true' : 'false'} style={sx('position:relative;width:' + art + 'px;height:' + art + 'px;flex-shrink:0')}>
        <div style={sx('position:relative;overflow:hidden;width:100%;height:100%;border-radius:var(--radius-xs)')}>
          {/* Greyed the way MediaCard greys an item you don't own: no colour, so a dark cover reads greyed too. */}
          {CoverArt && (absent
            ? <div style={sx('position:absolute;inset:0;filter:grayscale(1)')}><CoverArt src={image} /></div>
            : <CoverArt src={image} />)}
        </div>
        {onPlay && (
          <div className={REVEAL.item + ' sn-int'} onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); onPlay(e); }}
            onKeyDown={activate((e) => { e.stopPropagation(); onPlay(e); })} tabIndex={0}
            aria-label="Play episode" role="button" title="Play episode"
            style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:var(--radius-xs);background:var(--scrim-strong)')}>
            <Icon name="play_arrow" size="md" filled weight="strong" style={sx('color:var(--on-scrim)')} />
            {StateLayer && <StateLayer />}
          </div>
        )}
      </div>
      <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
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
          <div style={sx('width:100%;max-width:280px;height:2px;background:var(--surface-border);overflow:hidden')}>
            <div style={sx('height:100%;background:var(--play);width:' + percentOf(pct))} />
          </div>
        )}
        {description && (
          <div style={sx('font-size:var(--text-sm);line-height:1.4;color:' + muted + ';display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden')}>{description}</div>
        )}
        {actions && <div onClick={(e) => e && e.stopPropagation && e.stopPropagation()} style={sx('margin-top:4px')}>{actions}</div>}
      </div>
      {divider && <div aria-hidden="true" style={sx('position:absolute;bottom:0;right:' + (mobile ? '4px' : '12px') + ';left:' + (mobile ? (art + 20) + 'px' : (art + 28) + 'px') + ';height:1px;background:var(--surface-border)')} />}
      {StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}

import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * A library item's page: the MediaHeader over its list of tracks/episodes/chapters, revealed as a
 * circle from the point that opened it. `overlay` floats it above the current view (mobile, where
 * the view beneath stays mounted); otherwise it is ordinary page content (desktop).
 */
export function DetailPage({
  platform = 'desktop', origin, overlay = false, zIndex = 3,
  kindLabel, title, subtitle, meta, image, round = false,
  onSubtitle, onPlay, onPlayNext, onPlayLast, playLabel, nextLabel, lastLabel,
  listMaxWidth, children,
}) {
  const { MediaHeader, CircleReveal } = NS();
  const mobile = platform === 'mobile';
  const Reveal = CircleReveal || (({ children: kids, style }) => <div style={style}>{kids}</div>);
  const surface = overlay
    ? { position: 'absolute', inset: 0, zIndex, background: 'var(--surface-bg)', display: 'flex', flexDirection: 'column' }
    : { minHeight: '100%' };
  const pad = mobile ? 'var(--spacing-md) var(--spacing-lg) var(--spacing-2xl)' : 'var(--grid-margin)';
  const body = (
    <React.Fragment>
      {MediaHeader && (
        <MediaHeader platform={platform} kindLabel={kindLabel} title={title} subtitle={subtitle} meta={meta}
          image={image} round={round} onSubtitle={onSubtitle} onPlay={onPlay} onPlayNext={onPlayNext} onPlayLast={onPlayLast}
          playLabel={playLabel} nextLabel={nextLabel} lastLabel={lastLabel} />
      )}
      <div style={{ marginTop: mobile ? 'var(--spacing-lg)' : 28, maxWidth: listMaxWidth || (mobile ? undefined : 'var(--grid-max-width-list)') }}>{children}</div>
    </React.Fragment>
  );
  return (
    <Reveal x={origin && origin.x} y={origin && origin.y} style={surface}>
      {overlay
        ? <div style={{ flex: 1, overflowY: 'auto', padding: pad }}>{body}</div>
        : <div style={{ padding: pad }}>{body}</div>}
    </Reveal>
  );
}

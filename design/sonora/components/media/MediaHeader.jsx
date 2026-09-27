import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * Detail-page header for an album, book, podcast or artist. Switches between the stacked/centred
 * and side-by-side layouts at its own width, not the window's. `actions` swaps the default
 * Play/Next/Last cluster for a page whose verbs aren't a queue — a podcast show's Follow/notify/
 * settings/overflow, an episode's saved/downloaded/share/overflow. `progress` states how far into
 * a part-finished item the listener already is.
 */
export function MediaHeader({ kindLabel, title, subtitle, meta, playLabel = 'Play', nextLabel = 'Next', lastLabel = 'Last', round = false, image, platform, compactAt = 600, onPlay, onPlayNext, onPlayLast, onSubtitle, actions, progress = null }) {
  const Button = NS().Button, CoverArt = NS().CoverArt;
  const glyph = (name) => React.createElement('span', { style: sx("font-family:'Material Symbols Rounded';font-size:20px;line-height:1") }, name);
  const ref = React.useRef(null);
  // Measures itself, so a header inside a 412px phone frame or a narrow desktop pane both go compact.
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (platform || typeof ResizeObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < compactAt));
    ro.observe(el);
    return () => ro.disconnect();
  }, [platform, compactAt]);
  const mobile = platform ? platform === 'mobile' : narrow;
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const art = mobile ? 208 : 232;
  return (
    <div ref={ref} style={sx(mobile ? 'display:flex;flex-direction:column;align-items:center;gap:var(--spacing-md);text-align:center;padding-top:4px;padding-bottom:12px' : 'display:flex;gap:var(--spacing-2xl);align-items:flex-end')}>
      <div style={sx('position:relative;width:' + art + 'px;height:' + art + 'px;flex-shrink:0;overflow:hidden;border-radius:' + (round ? '50%' : 'var(--radius-lg)'))}>{CoverArt && <CoverArt src={image} />}</div>
      <div style={sx(mobile ? 'width:100%;display:flex;flex-direction:column;align-items:center;gap:var(--spacing-sm)' : 'flex:1;min-width:0;display:flex;flex-direction:column;gap:var(--spacing-sm)')}>
        <div style={sx('font-size:var(--text-xs);font-weight:var(--weight-strong);letter-spacing:.09em;text-transform:uppercase;color:' + muted + (mobile ? ';margin-top:6px' : ''))}>{kindLabel}</div>
        <div style={sx('font-family:var(--font-display),Inter;font-weight:var(--weight-super-strong);font-stretch:var(--display-stretch);line-height:1.15;color:' + fg + ';font-size:var(--' + (mobile ? 'h4' : 'h2') + '-size)')}>{title}</div>
        <div onClick={onSubtitle} style={sx('font-size:var(--text-' + (mobile ? 'md' : 'lg') + ');font-weight:var(--weight-medium);color:' + (onSubtitle ? 'var(--accent-ink);cursor:pointer' : fg))}>{subtitle}</div>
        <div style={sx('font-size:var(--text-sm);color:' + muted)}>{meta}</div>
        {/* Resume position for a part-finished item — "1h 21m left" lives in `meta` above; this is
            the bar that describes it. Gated the QuickPick/MediaCard way: null (the default) draws
            nothing, not a zero-width rule. */}
        {typeof progress === 'number' && (
          <div style={sx('width:100%;max-width:260px;height:3px;border-radius:var(--radius-pill);overflow:hidden;background:var(--surface-border)' + (mobile ? ';margin-left:auto;margin-right:auto' : ''))}>
            <div style={sx('height:100%;background:var(--accent);width:' + Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%')} />
          </div>
        )}
        <div style={sx('display:flex;flex-wrap:wrap;justify-content:' + (mobile ? 'center' : 'flex-start') + ';gap:' + (mobile ? '10px' : '12px') + ';margin-top:' + (mobile ? '8px' : '10px'))}>
          {actions != null ? actions : (
            <React.Fragment>
              {/* Same three queue actions as PlayActions, but labelled: on a detail page there is room
                  for words, and only Play carries the accent fill. */}
              {Button && <Button variant="primary" platform={mobile ? 'mobile' : 'desktop'} icon={glyph('play_arrow')} onClick={onPlay}>{playLabel}</Button>}
              {Button && <Button variant="secondary" platform={mobile ? 'mobile' : 'desktop'} icon={glyph('arrow_top_right')} onClick={onPlayNext}>{nextLabel}</Button>}
              {Button && <Button variant="secondary" platform={mobile ? 'mobile' : 'desktop'} icon={glyph('last_page')} onClick={onPlayLast}>{lastLabel}</Button>}
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}

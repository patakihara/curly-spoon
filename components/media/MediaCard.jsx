import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

if (typeof document !== 'undefined' && !document.getElementById('sonora-mediacard-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-mediacard-css';
  // Desktop reveals the corner menu on hover/focus, the same way PlayActions reveals over the art;
  // mobile has no hover, so it renders at full opacity there instead.
  el.textContent = '.sn-more{opacity:0;transition:opacity var(--duration-fast) ease}'
    + '.sn-more-host:hover .sn-more,.sn-more-host:focus-within .sn-more{opacity:1}';
  document.head.appendChild(el);
}

/** Shelf/grid card for any library item — album, book, podcast, episode. Replaces the old Card. */
export function MediaCard({ title, sub, platform = 'desktop', progress = null, absent = false, image, width, size = 'md', onClick, onPlay, onPlayNext, onPlayLast, playing = false, onMore, eyebrow, unplayed = false, savedBadge = false, markers }) {
  const mobile = platform === 'mobile';
  const small = size === 'sm';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const w = width || (small ? (mobile ? '116px' : '132px') : (mobile ? '152px' : '176px'));
  const seed = String(title || '').split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const STOPS = [
    ['var(--accent)', 'color-mix(in oklch, var(--accent) 45%, var(--art-gradient-end))'],
    ['color-mix(in oklch, var(--accent) 62%, white)', 'var(--accent)'],
    ['color-mix(in oklch, var(--accent) 58%, var(--state-warning))', 'color-mix(in oklch, var(--accent) 78%, black)'],
    ['color-mix(in oklch, var(--accent) 52%, var(--art-gradient-start))', 'color-mix(in oklch, var(--accent) 42%, var(--art-gradient-end))'],
    ['color-mix(in oklch, var(--accent) 82%, black)', 'color-mix(in oklch, var(--accent) 52%, white)'],
  ][seed % 5];
  const coverArt = 'linear-gradient(' + (120 + (seed % 4) * 30) + 'deg,' + STOPS[0] + ',' + STOPS[1] + ')';
  const hasProgress = typeof progress === 'number';
  const PlayActions = NS().PlayActions, CoverArt = NS().CoverArt;
  // Desktop only: these are revealed by hover, which a touch surface has no equivalent for.
  const showActions = !mobile && !absent && PlayActions && (onPlay || onPlayNext || onPlayLast);
  const showMore = !!onMore;
  const hostClasses = [showActions && 'sn-acts-host', showMore && !mobile && 'sn-more-host'].filter(Boolean).join(' ') || undefined;
  // Below ~132px the pill's label crowds the art, so the badge drops to its glyph alone.
  const artRef = React.useRef(null);
  const [tight, setTight] = React.useState(false);
  React.useEffect(() => {
    const el = artRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setTight(e.contentRect.width < 132));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div onClick={onClick} style={sx('display:flex;flex-direction:column;cursor:pointer;min-width:0;width:' + w + (w === '100%' ? '' : ';flex-shrink:0'))}>
      <div ref={artRef} className={hostClasses} style={sx('position:relative;width:100%;aspect-ratio:1;overflow:hidden;border-radius:var(--radius-' + (small || mobile ? 'sm' : 'md') + ')')}>
        {CoverArt && <CoverArt src={image} fallback={coverArt} />}
        {showMore && (
          <button onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); onMore(e); }} aria-label="More options" title="More options"
            className={mobile ? undefined : 'sn-more'}
            style={sx('position:absolute;top:6px;right:6px;width:30px;height:30px;border:none;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;background:var(--scrim-soft);color:var(--on-scrim)' + (mobile ? ';opacity:1' : ''))}>
            <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1")}>more_vert</span>
          </button>
        )}
        {/* New/unlistened is a property of the item, not of the card chrome, so it sits on the art
            itself rather than in the caption — same corner PreviewButton/QuickPick use for it.
            Dropped below the more-options button when both are present, so it doesn't paint
            under that button's hit area. */}
        {unplayed && <div aria-hidden="true" style={sx('position:absolute;top:' + (showMore ? '40px' : '6px') + ';right:6px;width:10px;height:10px;border-radius:50%;background:var(--accent)')} />}
        {savedBadge && (
          <div aria-hidden="true" title="Saved" style={sx('position:absolute;left:8px;bottom:8px;width:22px;height:26px;display:flex;align-items:flex-start;justify-content:center;padding-top:3px;border-radius:0 0 var(--radius-xs) var(--radius-xs);background:var(--accent);color:var(--accent-contrast)')}>
            <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;font-variation-settings:'FILL' 1,'wght' 500")}>bookmark</span>
          </div>
        )}
        {/* Not in library: the real artwork, darkened — the item exists, you just don't have it yet.
            Sits at the bottom, clear of the corner menu and any progress the item might otherwise show. */}
        {absent && <div style={sx('position:absolute;inset:0;background:var(--scrim-strong)')} />}
        {absent && <div title="Not in library" style={sx('position:absolute;left:8px;bottom:8px;display:flex;align-items:center;gap:4px;white-space:nowrap;padding:3px ' + (tight ? '5px' : 'var(--spacing-md) 3px var(--spacing-sm)') + ';border-radius:var(--radius-pill);font-size:var(--text-xs);font-weight:var(--weight-strong);background:var(--scrim-strong);color:var(--on-scrim)')}><span style={sx("font-family:'Material Symbols Rounded';font-size:14px;line-height:1;font-variation-settings:'FILL' 0,'wght' 500")}>cloud_off</span>{!tight && 'Not in library'}</div>}
        {showActions && (
          <div className="sn-acts sn-acts-scrim" style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--scrim-soft)')}>
            <PlayActions onNext={onPlayNext} onPlay={onPlay} onLast={onPlayLast} playing={playing} always />
          </div>
        )}
        {hasProgress && (
          <React.Fragment>
            {/* Gradient behind the bar so a light cover can't wash out the track. */}
            <div style={sx('position:absolute;left:0;right:0;bottom:0;height:38%;pointer-events:none;background:linear-gradient(to top, var(--scrim-strong), transparent)')} />
            <div style={sx('position:absolute;left:0;right:0;bottom:0;height:5px;margin:var(--spacing-sm) var(--spacing-md);border-radius:var(--radius-pill);overflow:hidden;background:var(--scrim)')}>
              <div style={sx('position:absolute;height:100%;background:var(--accent);width:' + Math.round((progress || 0) * 100) + '%')} />
            </div>
          </React.Fragment>
        )}
      </div>
      {/* Type-before-name: in a mixed shelf the kind of thing is scanned for first, so it leads
          rather than trailing in `sub` — kept as its own line rather than folded into the title
          so the title's own two-line clamp is untouched. */}
      {eyebrow && <div style={sx('margin-top:' + (small ? '8px' : '10px') + ';font-size:var(--text-xs);font-weight:var(--weight-strong);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + muted)}>{eyebrow}</div>}
      <div style={sx('margin-top:' + (eyebrow ? '2px' : (small ? '8px' : '10px')) + ';font-size:var(--text-' + (small ? 'sm' : 'md') + ');font-weight:var(--weight-strong);line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;color:' + fg)}>{title}</div>
      {markers && markers.length > 0 ? (
        <div style={sx('margin-top:2px;display:flex;align-items:center;gap:4px;min-width:0')}>
          <span style={sx('flex-shrink:0;display:inline-flex;gap:2px')}>
            {markers.map((m, i) => <span key={i} style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;color:" + muted + ";font-variation-settings:'FILL' 1,'wght' 500")}>{m}</span>)}
          </span>
          <div style={sx('min-width:0;font-size:var(--text-' + (small ? 'xs' : 'sm') + ');line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;color:' + muted)}>{sub}</div>
        </div>
      ) : (
        <div style={sx('margin-top:2px;font-size:var(--text-' + (small ? 'xs' : 'sm') + ');line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;color:' + muted)}>{sub}</div>
      )}
    </div>
  );
}

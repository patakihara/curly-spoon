import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};
// Enter and Space press it as a click does, unless they come from a control inside it.
const keys=(fn)=>(e)=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();fn(e);}};

if (typeof document !== 'undefined' && !document.getElementById('sonora-resultrow-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-resultrow-css';
  el.textContent = '.rr-act{opacity:0;transition:opacity var(--duration-quick) ease-in-out}.rr-art:hover .rr-act,.rr-act:focus-visible,.rr-art[data-always="true"] .rr-act{opacity:1}@keyframes rr-bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}.rr-bars{display:flex;align-items:center;gap:2px;height:16px;flex-shrink:0}.rr-bars i{display:block;width:3px;height:16px;border-radius:2px;background:var(--play-ink);transform-origin:center;animation:rr-bar .9s ease-in-out infinite}.rr-bars i:nth-child(2){animation-duration:.62s}.rr-bars i:nth-child(3){animation-duration:1.15s}@media (prefers-reduced-motion:reduce){.rr-bars i{animation:none;transform:scaleY(.6)}}';
  document.head.appendChild(el);
}

/** One row of a track / search / request list. Replaces the old TrackRow. */
export function ResultRow({ title, meta, detail, status, progress = null, tone = 'library', actionGlyph, image, icon, platform = 'desktop', onClick, onAction, divider = false, trailing, number = null }) {
  const mobile = platform === 'mobile';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const pctMatch = /(\d+)\s*%/.exec(status || '');
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : (pctMatch ? Number(pctMatch[1]) / 100 : null);
  const ringSize = 24;
  const st = String(status || '').toLowerCase();
  const queued = pct === null && st.indexOf('queued') > -1;
  const spinning = pct === null && st.indexOf('searching') > -1;
  const failed = pct === null && (st.indexOf('failed') > -1 || st.indexOf('error') > -1);
  const { Badge, CoverArt, ProgressRing, StateLayer } = NS();
  const off = !onClick;
  // The art's action is the row's own, given apart: opening the row never wears a Play label.
  const act = onAction;
  // No scrim without something to put on it — a bare dark square reads as a broken cover, not as work in flight.
  const ring = (pct !== null || spinning) && !!ProgressRing;
  const dimmed = ring || queued || failed;
  const showAction = !!act && !(mobile && dimmed);
  const badgeTone = { library: 'accent', request: 'warning', progress: 'warning', error: 'error' }[tone || 'library'] || 'accent';
  const nowPlaying = st === 'playing';
  // On a phone the title shares its line with the pill and any trailing control, so a status
  // with a percentage keeps only the percentage: the ring over the art already says it is in flight.
  const label = mobile && pctMatch ? pctMatch[1] + '%' : status;
  const statusPill = nowPlaying
    ? <div className="rr-bars" role="img" aria-label="Now playing"><i /><i /><i /></div>
    : (status && Badge ? <div style={sx('flex-shrink:0')}><Badge tone={badgeTone} size="md">{label}</Badge></div> : null);
  // A track number leads an album's rows in place of the art, which would only repeat the cover,
  // and a glyph a row with no cover of its own, such as a search suggestion.
  const numbered = typeof number === 'number';
  const glyphed = !numbered && !!icon;
  const lead = numbered || glyphed ? (mobile ? 28 : 32) : 52;
  // The art's action as drawn: only on the art, so never beside a number or a glyph.
  const acts = showAction && !numbered && !glyphed;
  // With only the art's action the row itself is no control, and nothing of it is drawn disabled.
  const loose = off && acts;
  // A row that opens and holds another control (the art's action, a trailing one) takes its tap
  // on the title for the keyboard and a screen reader, so no button sits inside another; a pointer
  // still taps it anywhere, and the row still draws the state.
  const split = !off && (acts || trailing != null);
  const rowStyle = sx('position:relative;display:flex;align-items:center;gap:' + (mobile ? '12px' : '16px') + ';padding:' + (mobile ? '8px 4px' : '10px 12px') + ';border-radius:var(--radius-xs)' + (loose ? '' : ';cursor:pointer'));
  const titleStyle = sx('flex:1;min-width:0;font-size:var(--text-md);font-weight:var(--weight-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + fg + (split ? ';outline:none' : ''));
  const whole = !loose && !split;
  // The trailing control's press is its own: it never also opens the row.
  const own = (e) => { if (e && e.stopPropagation) e.stopPropagation(); };
  return (
    <div className={loose ? undefined : 'sn-int'} role={whole ? 'button' : undefined} tabIndex={whole ? (off ? -1 : 0) : undefined} aria-disabled={whole ? off : undefined}
      onClick={off ? undefined : onClick} onKeyDown={whole && !off ? keys(onClick) : undefined}
      style={rowStyle}>
      {numbered ? (
        <div style={sx('width:' + lead + 'px;flex-shrink:0;text-align:center;font-size:var(--text-md);font-variant-numeric:tabular-nums;color:' + (nowPlaying ? 'var(--play-ink)' : muted))}>{number}</div>
      ) : glyphed ? (
        <span aria-hidden="true" style={sx("width:" + lead + "px;flex-shrink:0;text-align:center;font-family:'Material Symbols Rounded';font-size:var(--icon-sm);line-height:1;font-variation-settings:'FILL' 0,'wght' 400;color:" + muted)}>{icon}</span>
      ) : (
      <div className="rr-art" data-always={mobile ? 'true' : 'false'} style={sx('position:relative;width:52px;height:52px;flex-shrink:0')}>
        <div style={sx('position:relative;overflow:hidden;width:52px;height:52px;border-radius:' + (mobile ? '8px' : '6px'))}>
          {CoverArt && <CoverArt src={image} />}
        </div>
        {acts && (
          <div className="rr-act sn-int" role="button" tabIndex={0} onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); act(e); }}
            onKeyDown={keys((e) => { e.stopPropagation(); act(e); })}
            aria-label={failed ? 'Retry' : (spinning || queued ? 'Cancel request' : 'Play')}
            title={failed ? 'Retry' : (spinning || queued ? 'Cancel request' : 'Play')}
            style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;border-radius:' + (mobile ? '8px' : '6px') + ';background:var(--scrim-strong)')}>
            <span style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 1,'wght' 400;font-size:" + (mobile ? '26px' : '24px') + ';color:var(--on-scrim)')}>
              {failed ? 'refresh' : (spinning || queued ? 'close' : (actionGlyph === 'downloading' ? 'pause' : (actionGlyph || 'play_arrow')))}
            </span>
            {StateLayer && <StateLayer />}
          </div>
        )}
        {dimmed && (
          <div style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:' + (mobile ? '8px' : '6px') + ';background:var(--scrim)')}>
            {pct !== null && ProgressRing && <ProgressRing size={ringSize} value={pct} />}
            {spinning && ProgressRing && <ProgressRing size={ringSize} />}
            {(queued || failed) && <span style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 0,'wght' 400;font-size:" + ringSize + 'px;color:var(--accent-contrast)')}>{failed ? 'error' : 'schedule'}</span>}
          </div>
        )}
      </div>
      )}
      <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
        <div style={sx('display:flex;align-items:center;gap:var(--spacing-md)')}>
          {split
            ? <div role="button" tabIndex={0} onKeyDown={keys(onClick)} style={titleStyle}>{title}</div>
            : <div style={titleStyle}>{title}</div>}
          {mobile && statusPill}
          {mobile && trailing != null && <span style={sx('display:contents')} onClick={own}>{trailing}</span>}
        </div>
        <div style={sx('font-size:var(--text-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + muted)}>{meta}</div>
        {detail && <div style={sx('font-size:var(--text-sm);line-height:var(--leading-sm);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:' + fg)}>{detail}</div>}
      </div>
      {!mobile && statusPill}
      {!mobile && trailing != null && <span style={sx('display:contents')} onClick={own}>{trailing}</span>}
      {/* Inset to the text column, so the artwork column reads as one continuous edge. */}
      {divider && <div aria-hidden="true" style={sx('position:absolute;bottom:0;right:' + (mobile ? '4px' : '12px') + ';left:' + ((mobile ? 16 : 28) + lead) + 'px' + ';height:1px;background:var(--surface-border)')} />}
      {!loose && StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}

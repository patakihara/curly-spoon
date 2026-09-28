import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

if (typeof document !== 'undefined' && !document.getElementById('sonora-resultrow-css')) {
  const el = document.createElement('style');
  el.id = 'sonora-resultrow-css';
  el.textContent = '.rr-act{opacity:0;transition:opacity var(--duration-quick) ease-in-out}.rr-art:hover .rr-act,.rr-art[data-always="true"] .rr-act{opacity:1}@keyframes rr-bar{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}.rr-bars{display:flex;align-items:center;gap:2px;height:16px;flex-shrink:0}.rr-bars i{display:block;width:3px;height:16px;border-radius:2px;background:var(--play-ink);transform-origin:center;animation:rr-bar .9s ease-in-out infinite}.rr-bars i:nth-child(2){animation-duration:.62s}.rr-bars i:nth-child(3){animation-duration:1.15s}@media (prefers-reduced-motion:reduce){.rr-bars i{animation:none;transform:scaleY(.6)}}';
  document.head.appendChild(el);
}

/** One row of a track / search / request list. Replaces the old TrackRow. */
export function ResultRow({ title, meta, status, progress = null, tone = 'library', actionGlyph, image, platform = 'desktop', onClick, onAction, divider = false, trailing }) {
  const mobile = platform === 'mobile';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const pctMatch = /(\d+)\s*%/.exec(status || '');
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : (pctMatch ? Number(pctMatch[1]) / 100 : null);
  const ringSize = 24;
  const st = String(status || '').toLowerCase();
  const queued = pct === null && st.indexOf('queued') > -1;
  const spinning = pct === null && st.indexOf('searching') > -1;
  const failed = pct === null && (st.indexOf('failed') > -1 || st.indexOf('error') > -1);
  const Badge = NS().Badge, CoverArt = NS().CoverArt, ProgressRing = NS().ProgressRing;
  // No scrim without something to put on it — a bare dark square reads as a broken cover, not as work in flight.
  const ring = (pct !== null || spinning) && !!ProgressRing;
  const dimmed = ring || queued || failed;
  const showAction = !!(onAction || onClick) && !(mobile && dimmed);
  const badgeTone = { library: 'accent', request: 'warning', progress: 'warning', error: 'error' }[tone || 'library'] || 'accent';
  const nowPlaying = st === 'playing';
  const statusPill = nowPlaying
    ? <div className="rr-bars" role="img" aria-label="Now playing"><i /><i /><i /></div>
    : (status && Badge ? <div style={sx('flex-shrink:0')}><Badge tone={badgeTone} size="md">{status}</Badge></div> : null);
  return (
    <div onClick={onClick} style={sx('position:relative;display:flex;align-items:center;gap:' + (mobile ? '12px' : '16px') + ';padding:' + (mobile ? '8px 4px' : '10px 12px') + ';border-radius:var(--radius-xs);cursor:pointer')}>
      <div className="rr-art" data-always={mobile ? 'true' : 'false'} style={sx('position:relative;width:52px;height:52px;flex-shrink:0')}>
        <div style={sx('position:relative;overflow:hidden;width:52px;height:52px;border-radius:' + (mobile ? '8px' : '6px'))}>
          {CoverArt && <CoverArt src={image} />}
        </div>
        {showAction && (
          <div className="rr-act" onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); (onAction || onClick || function () {})(e); }}
            title={failed ? 'Retry' : (spinning || queued ? 'Cancel request' : 'Play')}
            style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2;border-radius:' + (mobile ? '8px' : '6px') + ';background:var(--scrim-strong)')}>
            <span style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 1,'wght' 400;font-size:" + (mobile ? '26px' : '24px') + ';color:var(--on-scrim)')}>
              {failed ? 'refresh' : (spinning || queued ? 'close' : (actionGlyph === 'downloading' ? 'pause' : (actionGlyph || 'play_arrow')))}
            </span>
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
      <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
        <div style={sx('display:flex;align-items:center;gap:var(--spacing-md)')}>
          <div style={sx('flex:1;min-width:0;font-size:var(--text-md);font-weight:var(--weight-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + fg)}>{title}</div>
          {mobile && statusPill}
          {mobile && trailing}
        </div>
        <div style={sx('font-size:var(--text-sm);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + muted)}>{meta}</div>
      </div>
      {!mobile && statusPill}
      {!mobile && trailing}
      {/* Inset to the text column, so the artwork column reads as one continuous edge. */}
      {divider && <div aria-hidden="true" style={sx('position:absolute;bottom:0;right:' + (mobile ? '4px' : '12px') + ';left:' + (mobile ? '68px' : '80px') + ';height:1px;background:var(--surface-border)')} />}
    </div>
  );
}

import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * Learn about what you're listening to without leaving the player — about the episode, the show,
 * the person, stacked beneath the transport. Sonora's player scrolls to lyrics and queue previews
 * and nothing else, so there was nowhere for an item's own description to live.
 */
export function AboutCard({ title, heading, meta, image, round = false, body, lines = 3, action, badge, platform = 'desktop' }) {
  const mobile = platform === 'mobile';
  const fg = 'var(--surface-fg)', muted = 'var(--surface-fg-muted)';
  const ExpandableText = NS().ExpandableText;
  const CoverArt = NS().CoverArt;
  const artSize = mobile ? 64 : 80;
  return (
    <div style={sx('display:flex;flex-direction:column;gap:var(--spacing-md);padding:var(--spacing-md);border-radius:var(--radius-sm);background:var(--surface-card)')}>
      <div style={sx('font-size:var(--text-xs);font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:' + muted)}>{title}</div>
      <div style={sx('display:flex;gap:var(--spacing-md);align-items:center')}>
        {/* position:relative is load-bearing: CoverArt fills its parent with position:absolute;
            inset:0, so without a containing block here the gradient escapes this box and covers
            the whole card, hiding every line of text under it. */}
        <div style={sx('position:relative;flex-shrink:0;width:' + artSize + 'px;height:' + artSize + 'px;border-radius:' + (round ? '50%' : 'var(--radius-xs)') + ';overflow:hidden')}>
          {CoverArt && <CoverArt src={image} />}
        </div>
        <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <div style={sx('display:flex;align-items:center;gap:6px;min-width:0')}>
            <div style={sx('flex:1;min-width:0;font-size:var(--text-lg);font-weight:700;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + fg)}>{heading}</div>
            {badge}
          </div>
          {meta && <div style={sx('font-size:var(--text-sm);color:' + muted)}>{meta}</div>}
          {action && <div style={sx('margin-top:var(--spacing-xs)')}>{action}</div>}
        </div>
      </div>
      {body && ExpandableText && (
        <ExpandableText lines={lines} text={body} />
      )}
    </div>
  );
}

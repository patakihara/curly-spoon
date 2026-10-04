import React from 'react';
import { NS, activate, injectCss, sx } from '../shared.js';

injectCss('sonora-expanderrow-css', '.sn-expander-chevron{transition:transform var(--duration-quick) var(--ease-standard)}'
    + '.sn-expander-chevron.sn-open{transform:rotate(180deg)}'
    + '@media (prefers-reduced-motion:reduce){.sn-expander-chevron{transition:none}}');

/** Collapses a homogeneous group inside an otherwise heterogeneous list — seven versions of one song folded behind "More releases · Show all" so the other result types stay reachable. */
export function ExpanderRow({ label, actionLabel = 'Show all', expanded = false, onToggle, image }) {
  const { CoverArt, StateLayer, Icon } = NS();
  const off = !onToggle;
  const toggle = () => onToggle(!expanded);
  return (
    <div className="sn-int" role="button" tabIndex={off ? -1 : 0} aria-disabled={off} aria-expanded={expanded}
      onClick={off ? undefined : toggle}
      onKeyDown={off ? undefined : activate(() => toggle())}
      style={sx('display:flex;align-items:center;gap:var(--spacing-md);padding:var(--spacing-md);border-radius:var(--radius-xs);background:var(--surface-card);cursor:pointer')}>
      {image && CoverArt && (
        /* position:relative so CoverArt's inset:0 fill resolves against this box, not the row. */
        <div style={sx('position:relative;width:36px;height:36px;flex-shrink:0;border-radius:var(--radius-xs);overflow:hidden')}>
          <CoverArt src={image} />
        </div>
      )}
      <div style={sx('flex:1;min-width:0;font-family:var(--font-body);font-size:var(--text-md);font-weight:var(--weight-strong);color:var(--surface-fg)')}>{label}</div>
      <div style={sx('flex-shrink:0;display:flex;align-items:center;gap:var(--spacing-xs);color:var(--surface-fg-muted);font-family:var(--font-body);font-size:var(--text-sm);font-weight:var(--weight-strong)')}>
        {actionLabel}
        <Icon name="expand_more" className={'sn-expander-chevron' + (expanded ? ' sn-open' : '')} />
      </div>
      {StateLayer && <StateLayer disabled={off} />}
    </div>
  );
}

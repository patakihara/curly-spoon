import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

import { RailItem } from './RailItem.jsx';

/** The desktop navigation rail: a bg-alt column of RailItems that widens between collapsed and expanded, with a menu toggle above and an optional footer below. */
export function NavRail({ items = [], active, onChange, expanded = true, onToggleExpanded, footer, header }) {
  return (
    <div style={sx(
      'flex-shrink:0;display:flex;flex-direction:column;height:100%;background:var(--surface-bg-alt);' +
      'width:var(--rail-width-' + (expanded ? 'expanded' : 'collapsed') + ');' +
      'transition:width var(--duration-slow) var(--ease-standard)'
    )}>
      {onToggleExpanded && (
        <div style={sx('display:flex;align-items:center;flex-shrink:0;box-sizing:border-box;height:var(--appbar-height);padding-top:0px;padding-bottom:0px;padding-right:var(--spacing-xl);padding-left:calc(var(--spacing-xl) + 6px)')}>
          <button onClick={onToggleExpanded} aria-label={expanded ? 'Collapse rail' : 'Expand rail'}
            style={sx("width:56px;height:40px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--surface-fg-muted);cursor:pointer;border-radius:var(--radius-pill);font-family:'Material Symbols Rounded';font-size:var(--icon-sm)")}>
            {expanded ? 'menu_open' : 'menu'}
          </button>
        </div>
      )}
      {header}
      {/* The item list is the only part that gives: the head keeps the bar's height and the footer
         stays put, so a rail too short for its items scrolls rather than squashing them. */}
      <div style={sx('flex:1;min-height:0;overflow-y:auto;scrollbar-width:none;display:flex;flex-direction:column;padding-top:var(--spacing-lg);padding-bottom:0px;padding-right:' + (expanded ? 'var(--spacing-xl)' : 'calc(var(--spacing-xl) + 6px)') + ';padding-left:calc(var(--spacing-xl) + 6px)')}>
        {items.map((it) => (
          <div key={it.key} style={sx('flex-shrink:0;height:var(--rail-row-height)')}>
            {/* Collapsed rail borrows the tab-bar behaviour: only the active row keeps its label,
                inactive rows are icon-only — the same treatment as BottomNav. */}
            <RailItem icon={it.icon} label={it.label} expanded={expanded} tabs={!expanded} wideActive={false} centerIcon={false}
              active={active === it.key} onClick={() => onChange && onChange(it.key)} />
          </div>
        ))}
      </div>
      {footer && <div style={sx('flex-shrink:0')}>{footer}</div>}
    </div>
  );
}

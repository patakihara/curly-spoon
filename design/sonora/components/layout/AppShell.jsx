import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));

import { ContentPane } from './ContentPane.jsx';

/** The frame every screen sits in: rail beside a column of app bar + content (+ optional side sheet), with the player docked across the bottom. */
export function AppShell({ children, rail, bar, sheet, sheetOpen = false, player, contentMinWidth, scroll = true, scrollKey, onProgress, theme, flat = false, square = false }) {
  return (
    <div data-theme={theme} style={sx('display:flex;flex-direction:column;height:100%;background:var(--surface-bg)')}>
      <div style={sx('display:flex;flex:1;min-height:0')}>
        {rail}
        {/* The sheet is a sibling of the whole bar+content column, not of the content alone, so it
            and its divider run up alongside the app bar and its title sits at the bar's level. */}
        <div style={sx('display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;background:var(--surface-bg-alt)' + (contentMinWidth ? ';min-width:' + contentMinWidth : ''))}>
          <div style={sx('flex-shrink:0')}>{bar}</div>
          <ContentPane flat={flat} square={square} squareRight={sheetOpen && !!sheet} scroll={scroll} scrollKey={scrollKey} onProgress={onProgress}>{children}</ContentPane>
        </div>
        {sheet}
      </div>
      <div style={sx('flex-shrink:0;width:100%')}>{player}</div>
    </div>
  );
}

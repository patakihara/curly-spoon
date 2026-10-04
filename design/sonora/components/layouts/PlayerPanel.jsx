import React from 'react';
import { NS } from '../shared.js';

/**
 * The desktop player's frame: a side panel beside the content column, its tabs (Now playing, Queue,
 * Lyrics) sharing the panel's width so none is cut off, over the active tab's page as `children`.
 * `NowPlaying` fills it; the player bar beneath the window carries the transport.
 */
export function PlayerPanel({ open = false, tab, onTabChange, onClose, tabs = [], title = 'Player', width, children }) {
  const { SideSheet, TabBar } = NS();
  if (!SideSheet) return null;
  return (
    <SideSheet open={open} title={title} onClose={onClose} width={width}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {TabBar && tabs.length > 1 && <TabBar platform="desktop" fill items={tabs} value={tab} onChange={onTabChange} />}
        {children}
      </div>
    </SideSheet>
  );
}

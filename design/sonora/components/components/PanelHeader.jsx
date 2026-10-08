import React from 'react';
import { NS, sx } from '../shared.js';

/*
 * How each variant sits: its row (height, inset, the gap between its parts, its fill) and its
 * title. `player` is the phone player sheet's bar, `page` a player sub-page's bar, `sheet` a side
 * sheet's title row, as tall as the desktop app bar so its title lines up with the bar's.
 */
const ROW = {
  player: 'height:var(--appbar-height-mobile);gap:var(--spacing-sm);padding:0 var(--spacing-lg)',
  page: 'height:var(--appbar-height-mobile)',
  sheet: 'height:var(--appbar-height);padding:0 var(--spacing-xl);background:var(--surface-bg-alt)',
};
const TITLE = {
  player: 'text-align:center;font-size:var(--text-xs);letter-spacing:var(--tracking-caps);text-transform:uppercase;font-weight:var(--weight-strong);color:var(--surface-fg-muted)',
  page: 'font-family:var(--font-body);font-weight:var(--weight-strong);font-size:var(--text-xl);line-height:var(--line-height-snug);color:var(--surface-fg)',
  // The title stops a gap short of the close, which is pinned to the top corner.
  sheet: 'padding-right:calc(var(--control-md) + var(--spacing-md) * 2 - var(--spacing-xl));font-family:var(--font-heading);font-weight:var(--weight-super-strong);font-size:var(--h3-size);color:var(--surface-fg)',
};

/**
 * The header of a panel: its title, any controls before and after it, and its close. Sonora's one
 * panel header: the phone player sheet, the player's sub-pages and the side sheet all draw it.
 * The app bar is BackLayer's, not this.
 */
export function PanelHeader({
  title, variant = 'page', platform = 'mobile', leading, trailing,
  onClose, closeLabel, closeGlyph = 'close', closeControls, divider = false,
}) {
  const { IconButton } = NS();
  const sheet = variant === 'sheet';
  const row = ROW[variant] || ROW.page;
  const inset = variant === 'page' ? ';padding:0 ' + (platform === 'mobile' ? 'var(--spacing-lg)' : 'var(--spacing-md)') : '';
  return (
    <div style={sx('position:relative;display:flex;align-items:center;flex-shrink:0;box-sizing:border-box;' + row + inset
      + (divider ? ';border-bottom:var(--hairline) solid var(--surface-border)' : ''))}>
      {leading}
      <div style={sx('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + (TITLE[variant] || TITLE.page))}>{title}</div>
      {trailing}
      {onClose && IconButton && (
        <IconButton size={sheet ? 'md' : undefined} muted icon={closeGlyph} label={closeLabel || 'Close ' + (title || 'panel')}
          controls={closeControls} onClick={onClose}
          style={sheet ? sx('position:absolute;top:var(--spacing-md);right:var(--spacing-md)') : undefined} />
      )}
    </div>
  );
}

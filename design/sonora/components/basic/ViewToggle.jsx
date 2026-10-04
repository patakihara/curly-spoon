import React from 'react';
import { NS } from '../shared.js';

/** Single tonal icon button that flips a collection between list and grid. It shows the view you'd switch TO, turning the icon over as it changes. */
export function ViewToggle({ value = 'grid', onChange, platform = 'desktop' }) {
  const TonalIconButton = NS().TonalIconButton;
  if (!TonalIconButton) return null;
  const next = value === 'grid' ? 'list' : 'grid';
  return (
    <TonalIconButton glyph={next === 'list' ? 'view_list' : 'grid_view'}
      label={next === 'list' ? 'Switch to list view' : 'Switch to grid view'}
      onClick={onChange ? () => onChange(next) : undefined} />
  );
}

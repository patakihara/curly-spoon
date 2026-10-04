import React from 'react';
import { NS } from '../shared.js';

/** A tonal IconButton that flips a collection between list and grid. It shows the view you'd switch TO, turning the icon over as it changes. */
export function ViewToggle({ value = 'grid', onChange, platform = 'desktop' }) {
  const IconButton = NS().IconButton;
  if (!IconButton) return null;
  const next = value === 'grid' ? 'list' : 'grid';
  const label = next === 'list' ? 'Switch to list view' : 'Switch to grid view';
  return (
    <IconButton variant="tonal" icon={next === 'list' ? 'view_list' : 'grid_view'} label={label} title={label}
      onClick={onChange ? () => onChange(next) : undefined} />
  );
}

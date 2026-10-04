import React from 'react';
import { NS } from '../shared.js';

/** App-bar search affordance: a search icon that becomes a close icon while the field is out. */
export function SearchButton({ open = false, onToggle, muted = true, label }) {
  const IconButton = NS().IconButton;
  if (!IconButton) return null;
  return (
    <IconButton label={label || (open ? 'Close search' : 'Search')} muted={muted} onClick={onToggle ? () => onToggle(!open) : undefined}
      icon={open ? 'close' : 'search'} />
  );
}

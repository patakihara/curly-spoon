import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/** App-bar search affordance: a search icon that becomes a close icon while the field is out. */
export function SearchButton({ open = false, onToggle, muted = true, label }) {
  const IconButton = NS().IconButton;
  if (!IconButton) return null;
  return (
    <IconButton label={label || (open ? 'Close search' : 'Search')} muted={muted} onClick={onToggle ? () => onToggle(!open) : undefined}>
      <span style={{ fontFamily: 'Material Symbols Rounded', fontSize: 'var(--icon-sm)', lineHeight: 1 }}>{open ? 'close' : 'search'}</span>
    </IconButton>
  );
}

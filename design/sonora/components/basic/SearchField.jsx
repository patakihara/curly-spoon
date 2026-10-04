import React from 'react';
import { NS, sx } from '../shared.js';

/** Filled search field: no outline, softly rectangular (not a pill). Sits in a back layer's heading as its local search. */
export function SearchField({ placeholder, value, onChange, platform = 'desktop', width = '100%', height, onSubmit, autoFocus = false, onClose, closeGlyph = 'close', disabled }) {
  // The close control names the input it folds away, so assistive tech knows what it acts on.
  const id = React.useId();
  const StateLayer = NS().StateLayer;
  const off = !!disabled || !onChange;
  const mobile = platform === 'mobile';
  const ref = React.useRef(null);
  // Focus on open, not on mount: the field is often revealed by a morph rather than remounted,
  // and the focus has to wait a frame for the reveal to give it a box.
  React.useEffect(() => {
    if (!autoFocus) return;
    const id = requestAnimationFrame(() => { if (ref.current) ref.current.focus(); });
    return () => cancelAnimationFrame(id);
  }, [autoFocus]);
  return (
    <div className="sn-int sn-filled" data-disabled={off ? '' : undefined} style={sx('display:flex;align-items:center;gap:var(--spacing-md);width:' + width + ';height:' + (height || (mobile ? '40px' : '44px')) + ';padding:0 var(--spacing-lg);box-sizing:border-box;border:none;border-radius:var(--radius-xs);background:var(--surface-card);color:var(--surface-fg)')}>
      <span style={sx("font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;flex-shrink:0;color:var(--surface-fg-muted)")}>search</span>
      <input ref={ref} id={id} value={value} placeholder={placeholder} disabled={off} onChange={off ? undefined : (e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onSubmit) onSubmit(e.target.value); }}
        style={sx('flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:var(--font-body);font-weight:var(--weight-body);font-size:var(--text-md);color:var(--surface-fg)')} />
      {onClose && (
        <button type="button" className="sn-int" onClick={onClose} aria-controls={id} aria-label="Close search" title="Close search"
          style={sx("position:relative;font-family:'Material Symbols Rounded';font-size:var(--icon-xs);line-height:1;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:50%;cursor:pointer;background:transparent;color:var(--surface-fg-muted);transition:color var(--duration-fast) ease")}>
          {closeGlyph}
          {StateLayer && <StateLayer />}
        </button>
      )}
      {StateLayer && <StateLayer disabled={off} ripple={false} />}
    </div>
  );
}

import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * Standalone offline-availability toggle: idle -> downloading (composes ProgressRing, cancellable)
 * -> done. Where ResultRow already has artwork to draw progress over, this is the control for
 * everywhere else — an episode row's action bar, a header, anywhere there is no cover to borrow.
 */
export function DownloadButton({ state = 'idle', progress = null, onClick, size = 34 }) {
  const ProgressRing = NS().ProgressRing;
  const downloading = state === 'downloading';
  const done = state === 'done';
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null;
  // The label states what pressing the control does next, not the icon it currently shows.
  const label = done ? 'Remove download' : downloading ? 'Cancel download' : 'Download';
  const ink = done ? 'var(--tone-library)' : 'var(--surface-fg-muted)';
  return (
    <button onClick={onClick} aria-label={label} title={label}
      style={sx('position:relative;display:flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;border:' + (downloading ? 'none' : '1px solid var(--surface-border)') + ';background:transparent;padding:0;cursor:pointer;color:' + ink + ';transition:color var(--duration-fast) var(--ease-standard)')}>
      {downloading && ProgressRing && (
        // The ring itself owns the spin/sweep; we only ever pass it a size and, when known, a value.
        <div style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
          {pct !== null ? <ProgressRing size={size} value={pct} /> : <ProgressRing size={size} />}
        </div>
      )}
      <span aria-hidden="true" style={sx("position:relative;font-family:'Material Symbols Rounded';font-variation-settings:'FILL' " + (done ? 1 : 0) + ",'wght' 500;font-size:var(--icon-" + (downloading ? 'xs' : 'sm') + ');line-height:1')}>
        {downloading ? 'stop' : (done ? 'download_done' : 'download')}
      </span>
    </button>
  );
}

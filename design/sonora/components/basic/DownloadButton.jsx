import React from 'react';
import { NS, clamp01, sx } from '../shared.js';

/**
 * Standalone offline-availability toggle: idle -> downloading (composes ProgressRing, cancellable)
 * -> done. Where ResultRow already has artwork to draw progress over, this is the control for
 * everywhere else — an episode row's action bar, a header, anywhere there is no cover to borrow.
 */
export function DownloadButton({ state = 'idle', progress = null, onClick, size = 34 }) {
  const { ProgressRing, StateLayer, Icon } = NS();
  const off = !onClick;
  const downloading = state === 'downloading';
  const done = state === 'done';
  const pct = typeof progress === 'number' ? clamp01(progress) : null;
  // The label states what pressing the control does next, not the icon it currently shows.
  const label = done ? 'Remove download' : downloading ? 'Cancel download' : 'Download';
  const ink = done ? 'var(--tone-library)' : 'var(--surface-fg-muted)';
  return (
    <button className="sn-int" onClick={off ? undefined : onClick} disabled={off} aria-label={label} title={label}
      style={sx('position:relative;display:flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;border:' + (downloading ? 'none' : '1px solid var(--surface-border)') + ';background:transparent;padding:0;cursor:pointer;color:' + ink + ';transition:color var(--duration-fast) var(--ease-standard)')}>
      {downloading && ProgressRing && (
        // The ring owns the spin/sweep; we pass a size and, when known, a value. Colour and track
        // must be passed too: ProgressRing defaults to white-on-white-28% because its usual home
        // is a scrim over artwork, and those defaults are invisible on a page surface in the
        // light theme. Ink comes from the tokens so it inverts with the theme.
        <div style={sx('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
          {pct !== null
            ? <ProgressRing size={size} value={pct} color="var(--accent-ink)" track="var(--surface-border)" />
            : <ProgressRing size={size} color="var(--accent-ink)" track="var(--surface-border)" />}
        </div>
      )}
      <Icon name={downloading ? 'stop' : (done ? 'download_done' : 'download')} size={downloading ? 'xs' : 'sm'} filled={done} weight="strong" style={sx('position:relative')} />
      {StateLayer && <StateLayer disabled={off} />}
    </button>
  );
}

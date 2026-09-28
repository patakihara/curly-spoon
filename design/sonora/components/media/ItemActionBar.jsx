import React from 'react';
const sx=(s)=>Object.fromEntries(String(s).split(';').filter(d=>d.trim()).map(d=>{const i=d.indexOf(':');const k=d.slice(0,i).trim();return [k.startsWith('--')?k:k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),d.slice(i+1).trim()];}));
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

/**
 * Per-item verb set for a row or a card: save, download, share, more, and a trailing play —
 * each verb only renders when its handler is supplied. Save and download are toggles that show
 * their own state (outlined idle, filled and --tone-library when done), unlike PlayActions, which
 * is a one-shot queue group with nothing persistent to show.
 */
export function ItemActionBar({ saved = false, onSave, download = 'idle', downloadProgress = null, onDownload, onShare, onMore, onPlay, playing = false, size = 34, platform = 'desktop' }) {
  const DownloadButtonC = NS().DownloadButton;
  const iconSize = 'var(--icon-sm)';
  const savedLabel = saved ? 'Remove from saved' : 'Save episode';
  const shareLabel = 'Share episode';
  const moreLabel = 'More options';
  const playLabel = playing ? 'Pause' : 'Play';
  // Plain circular icon buttons — transparent until hovered/focused, unlike MediaCard's
  // over-artwork "more" which needs a scrim to stay legible on any cover.
  const btnStyle = (active) => sx('display:flex;align-items:center;justify-content:center;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;border:none;background:transparent;padding:0;cursor:pointer;color:' + (active ? 'var(--tone-library)' : 'var(--surface-fg-muted)') + ';transition:color var(--duration-fast) var(--ease-standard)');
  return (
    <div style={sx('display:flex;align-items:center;gap:' + (platform === 'mobile' ? 'var(--spacing-sm)' : 'var(--spacing-md)'))}>
      {onSave && (
        <button onClick={onSave} aria-label={savedLabel} title={savedLabel} aria-pressed={saved} style={btnStyle(saved)}>
          <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' " + (saved ? 1 : 0) + ",'wght' 500;font-size:" + iconSize + ';line-height:1')}>bookmark</span>
        </button>
      )}
      {onDownload && DownloadButtonC && (
        <DownloadButtonC state={download} progress={downloadProgress} onClick={onDownload} size={size} />
      )}
      {onShare && (
        <button onClick={onShare} aria-label={shareLabel} title={shareLabel} style={btnStyle(false)}>
          <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 0,'wght' 500;font-size:" + iconSize + ';line-height:1')}>share</span>
        </button>
      )}
      {onMore && (
        <button onClick={onMore} aria-label={moreLabel} title={moreLabel} style={btnStyle(false)}>
          <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 0,'wght' 500;font-size:" + iconSize + ';line-height:1')}>more_vert</span>
        </button>
      )}
      {onPlay && (
        // Pushed to the far edge, away from the toggle cluster, so it reads as the primary action.
        <button onClick={onPlay} aria-label={playLabel} title={playLabel}
          style={sx('display:flex;align-items:center;justify-content:center;margin-left:auto;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;border-radius:50%;border:none;background:var(--play);color:var(--play-contrast);padding:0;cursor:pointer')}>
          <span aria-hidden="true" style={sx("font-family:'Material Symbols Rounded';font-variation-settings:'FILL' 1,'wght' 500;font-size:" + iconSize + ';line-height:1')}>{playing ? 'pause' : 'play_arrow'}</span>
        </button>
      )}
    </div>
  );
}

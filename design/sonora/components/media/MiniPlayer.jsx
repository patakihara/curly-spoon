import React from 'react';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const iconBtn = (color, size = 36, glyph = 'var(--icon-sm)', dim = false) => ({
  width: size, height: size, borderRadius: '50%', border: 'none', flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', color, cursor: 'pointer',
  // Inactive toggles dim by alpha so they blend with whatever surface they sit on,
  // rather than switching to a fixed muted color that can clash with a tinted bar.
  opacity: dim ? 0.45 : 1, transition: 'opacity 0.15s ease',
  fontFamily: 'Material Symbols Rounded', fontSize: glyph,
});

// The play or pause glyph is filled, white on the rose: the font's default outline would leave a
// hairline ring around a rose middle, which reads as a dark glyph at 1x.
const playBtn = { ...iconBtn('var(--play-icon)', 44), background: 'var(--play)', fontVariationSettings: "'FILL' 1,'wght' 500" };

/**
 * The persistent now-playing surface. One component, two platform variants:
 * mobile is the tinted pill docked above the bottom nav; desktop is the
 * full-width three-column transport bar docked to the bottom of the window.
 */
export function MiniPlayer({
  title, artist, image, playing, onTogglePlay, onOpen,
  platform = 'mobile', progress = 0, onSeek, duration = 258,
  onPrev, onNext, queueOpen, onToggleQueue, lyricsOpen, onToggleLyrics,
}) {
  if (platform === 'desktop') {
    const fg = 'var(--surface-now-playing-fg)';
    const muted = 'var(--surface-now-playing-fg-muted)';
    return (
      <div style={{
        height: 82, flexShrink: 0, width: '100%', boxSizing: 'border-box', borderTop: '1px solid var(--surface-border)',
        background: 'var(--surface-now-playing)',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', padding: '0 var(--spacing-xl)', gap: 'var(--spacing-lg)',
      }}>
        <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', minWidth: 0, cursor: onOpen ? 'pointer' : 'default' }}>
          <div style={{
            width: 52, height: 52, flexShrink: 0, borderRadius: 'var(--radius-xs)', overflow: 'hidden',
            background: image ? undefined : 'var(--accent)',
          }}>
            {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: fg, fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-md)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            <div style={{ color: muted, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
            <button aria-label="Shuffle" style={iconBtn(fg, 36, 'var(--icon-sm)', true)}>shuffle</button>
            <button aria-label="Previous" onClick={onPrev} style={iconBtn(fg)}>skip_previous</button>
            <button aria-label={playing ? 'Pause' : 'Play'} onClick={onTogglePlay}
              style={playBtn}>{playing ? 'pause' : 'play_arrow'}</button>
            <button aria-label="Next" onClick={onNext} style={iconBtn(fg)}>skip_next</button>
            <button aria-label="Repeat" style={iconBtn(fg, 36, 'var(--icon-sm)', true)}>repeat</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', width: '100%', maxWidth: 480 }}>
            <span style={{ color: muted, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', width: 36 }}>{mmss(progress * duration)}</span>
            <div style={{ flex: 1, height: 4, borderRadius: 'var(--radius-pill)', background: 'color-mix(in srgb, var(--surface-now-playing-fg) 28%, transparent)', cursor: 'pointer' }}
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek && onSeek((e.clientX - r.left) / r.width); }}>
              <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 'var(--radius-pill)', background: 'var(--play)' }} />
            </div>
            <span style={{ color: muted, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', width: 36 }}>{mmss(duration)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--spacing-lg)' }}>
          <button aria-label="Lyrics" onClick={onToggleLyrics} style={{ ...iconBtn(fg), color: lyricsOpen ? 'var(--play-ink)' : fg }}>lyrics</button>
          <button aria-label="Queue" onClick={onToggleQueue} style={{ ...iconBtn(fg), color: queueOpen ? 'var(--play-ink)' : fg }}>queue_music</button>
          <button aria-label="Volume" style={iconBtn(fg)}>volume_up</button>
        </div>
      </div>
    );
  }

  return (
    <div onClick={onOpen} style={{
      display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
      padding: 'var(--spacing-md)', cursor: 'pointer',
      background: 'var(--surface-now-playing)',
      overflow: 'visible', height: 48, boxSizing: 'content-box',
      borderTop: '1px solid var(--surface-border)', borderBottom: '1px solid var(--surface-border)',
    }}>
      <div style={{
        width: 'var(--miniplayer-album-size)', height: 'var(--miniplayer-album-size)', flexShrink: 0,
        borderRadius: 'var(--radius-xs)', overflow: 'hidden', background: image ? undefined : 'var(--art-gradient-end)',
      }}>
        {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--surface-now-playing-fg)', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-lg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ color: 'var(--surface-now-playing-fg-muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}</div>
      </div>
      <button aria-label={playing ? 'Pause' : 'Play'} onClick={(e) => { e.stopPropagation(); onTogglePlay && onTogglePlay(); }}
        style={playBtn}>{playing ? 'pause' : 'play_arrow'}</button>
    </div>
  );
}

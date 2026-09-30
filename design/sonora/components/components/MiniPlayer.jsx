import React from 'react';
const NS=()=>(typeof window!=='undefined'&&window.SonoraDesignSystem_6c1435)||{};

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
 * full-width three-column transport bar docked to the bottom of the window, the
 * one place desktop draws the transport. `variant="spoken"` gives that bar
 * speed, skip back and forward and the sleep timer in place of shuffle, previous,
 * next and repeat, and drops the lyrics button: spoken content has none.
 */
export function MiniPlayer({
  title, artist, image, playing, onTogglePlay, onOpen,
  platform = 'mobile', progress = 0, onSeek, duration = 258,
  onPrev, onNext, onShuffle, onRepeat, onVolume, queueOpen, onToggleQueue, lyricsOpen, onToggleLyrics,
  variant = 'music', onSkipBack, onSkipForward, skipSeconds = 15, speed = 1, onSpeed, sleep = 'Off', onSleep,
}) {
  const spoken = variant === 'spoken';
  const { StateLayer, Slider } = NS();
  // Every control on the bar: one with no handler is drawn disabled, and a press on one never
  // reaches the bar beneath it.
  const btn = (label, fn, style, glyph) => (
    <button className={'sn-int' + (style === playBtn ? ' sn-filled' : '')} aria-label={label} disabled={!fn}
      onClick={fn ? (e) => { e.stopPropagation(); fn(); } : undefined} style={style}>
      {glyph}
      {StateLayer && <StateLayer disabled={!fn} />}
    </button>
  );
  // The interval is drawn as a number over a plain circular arrow, as TransportBar's spoken skip is:
  // Material Symbols ships only fixed 5/10/30 glyphs. The arrow alone is mirrored for forward.
  const skip = (dir) => (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <span aria-hidden="true" style={{ display: 'inline-block', transform: dir === 'forward' ? 'scaleX(-1)' : 'none' }}>replay</span>
      <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 9 }}>{skipSeconds}</span>
    </span>
  );
  if (platform === 'desktop') {
    const fg = 'var(--surface-now-playing-fg)';
    const muted = 'var(--surface-now-playing-fg-muted)';
    return (
      <div style={{
        height: 82, flexShrink: 0, width: '100%', boxSizing: 'border-box', borderTop: '1px solid var(--surface-border)',
        background: 'var(--surface-now-playing)',
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', padding: '0 var(--spacing-xl)', gap: 'var(--spacing-lg)',
      }}>
        <div className="sn-int" role="button" aria-label={'Open player, ' + title} tabIndex={onOpen ? 0 : -1} aria-disabled={!onOpen}
          onClick={onOpen} onKeyDown={onOpen && ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } })}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', minWidth: 0, justifySelf: 'start', maxWidth: '100%', cursor: 'pointer', borderRadius: 'var(--radius-xs)' }}>
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
          {StateLayer && <StateLayer disabled={!onOpen} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-sm)', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)' }}>
            {spoken ? (
              <>
                {btn('Playback speed, ' + speed + ' times', onSpeed,
                  { ...iconBtn(speed === 1 ? muted : 'var(--play-ink)'), fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-sm)' }, speed + '×')}
                {btn('Skip back ' + skipSeconds + ' seconds', onSkipBack, iconBtn(fg), skip('back'))}
              </>
            ) : (
              <>
                {btn('Shuffle', onShuffle, iconBtn(fg, 36, 'var(--icon-sm)', true), 'shuffle')}
                {btn('Previous', onPrev, iconBtn(fg), 'skip_previous')}
              </>
            )}
            {btn(playing ? 'Pause' : 'Play', onTogglePlay, playBtn, playing ? 'pause' : 'play_arrow')}
            {spoken ? (
              <>
                {btn('Skip forward ' + skipSeconds + ' seconds', onSkipForward, iconBtn(fg), skip('forward'))}
                {btn('Sleep timer, ' + sleep, onSleep, iconBtn(sleep === 'Off' ? fg : 'var(--accent-ink)', 36, 'var(--icon-sm)', sleep === 'Off'), 'bedtime')}
              </>
            ) : (
              <>
                {btn('Next', onNext, iconBtn(fg), 'skip_next')}
                {btn('Repeat', onRepeat, iconBtn(fg, 36, 'var(--icon-sm)', true), 'repeat')}
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', width: '100%', maxWidth: 480 }}>
            <span style={{ color: muted, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', width: 36 }}>{mmss(progress * duration)}</span>
            <div style={{ flex: 1, display: 'flex' }}>{Slider && <Slider value={progress} onChange={onSeek} tone="play" />}</div>
            <span style={{ color: muted, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', width: 36 }}>{mmss(duration)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--spacing-lg)' }}>
          {!spoken && btn('Lyrics', onToggleLyrics, { ...iconBtn(fg), color: lyricsOpen ? 'var(--play-ink)' : fg }, 'lyrics')}
          {btn('Queue', onToggleQueue, { ...iconBtn(fg), color: queueOpen ? 'var(--play-ink)' : fg }, 'queue_music')}
          {btn('Volume', onVolume, iconBtn(fg), 'volume_up')}
        </div>
      </div>
    );
  }

  return (
    <div className="sn-int" role="button" aria-label={'Open player, ' + title} tabIndex={onOpen ? 0 : -1} aria-disabled={!onOpen}
      onClick={onOpen} onKeyDown={onOpen && ((e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } })}
      style={{
      display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
      padding: 'var(--spacing-md)', cursor: 'pointer', color: 'var(--surface-now-playing-fg)',
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
      {btn(playing ? 'Pause' : 'Play', onTogglePlay, playBtn, playing ? 'pause' : 'play_arrow')}
      {StateLayer && <StateLayer disabled={!onOpen} />}
    </div>
  );
}

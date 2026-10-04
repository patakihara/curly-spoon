import React from 'react';
import { NS, activate, skipGlyph } from '../shared.js';

// Over the bar's tint the controls take the now-playing inks: IconButton's surface inks, rebound
// for the bar, so its plain and muted glyphs, the seek bar's readouts, the slider's halo and the
// open-player area's hover and press wash match the tint.
const INKS = { '--surface-fg': 'var(--surface-now-playing-fg)', '--surface-fg-muted': 'var(--surface-now-playing-fg-muted)' };

// Inactive toggles dim by alpha so they blend with whatever surface they sit on, rather than
// switching to a fixed muted color that can clash with a tinted bar.
const DIM = { opacity: 'var(--opacity-dim)' };

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
  const { StateLayer, IconButton, SeekBar, Icon } = NS();
  // Every control on the bar: one with no handler is drawn disabled, and a press on one never
  // reaches the bar beneath it.
  const press = (fn) => fn && ((e) => { e.stopPropagation(); fn(); });
  // The play or pause glyph is filled, white on the rose: IconButton's play variant.
  const play = (
    <IconButton variant="play" size="lg" icon={playing ? 'pause' : 'play_arrow'} label={playing ? 'Pause' : 'Play'} onClick={press(onTogglePlay)} />
  );
  if (platform === 'desktop') {
    const fg = 'var(--surface-now-playing-fg)';
    const muted = 'var(--surface-now-playing-fg-muted)';
    return (
      <div style={{
        height: 82, flexShrink: 0, width: '100%', boxSizing: 'border-box', borderTop: '1px solid var(--surface-border)',
        background: 'var(--surface-now-playing)', ...INKS,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', padding: '0 var(--spacing-xl)', gap: 'var(--spacing-lg)',
      }}>
        <div className="sn-int" role="button" aria-label={'Open player, ' + title} tabIndex={onOpen ? 0 : -1} aria-disabled={!onOpen}
          onClick={onOpen} onKeyDown={onOpen && activate(() => onOpen())}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', minWidth: 0, justifySelf: 'start', maxWidth: '100%', cursor: 'pointer', borderRadius: 'var(--radius-xs)', color: 'var(--surface-fg)' }}>
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
                <IconButton label={'Playback speed, ' + speed + ' times'} onClick={press(onSpeed)} active={speed !== 1} muted={speed === 1} tone="play-ink">
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-sm)' }}>{speed + '×'}</span>
                </IconButton>
                <IconButton label={'Skip back ' + skipSeconds + ' seconds'} onClick={press(onSkipBack)}>{skipGlyph(Icon, 'back', skipSeconds)}</IconButton>
              </>
            ) : (
              <>
                <IconButton icon="shuffle" label="Shuffle" onClick={press(onShuffle)} style={DIM} />
                <IconButton icon="skip_previous" label="Previous" onClick={press(onPrev)} />
              </>
            )}
            {play}
            {spoken ? (
              <>
                <IconButton label={'Skip forward ' + skipSeconds + ' seconds'} onClick={press(onSkipForward)}>{skipGlyph(Icon, 'forward', skipSeconds)}</IconButton>
                <IconButton icon="bedtime" label={'Sleep timer, ' + sleep} onClick={press(onSleep)} active={sleep !== 'Off'} tone="accent-ink" style={sleep === 'Off' ? DIM : undefined} />
              </>
            ) : (
              <>
                <IconButton icon="skip_next" label="Next" onClick={press(onNext)} />
                <IconButton icon="repeat" label="Repeat" onClick={press(onRepeat)} style={DIM} />
              </>
            )}
          </div>
          <div style={{ width: '100%', maxWidth: 'var(--seek-max-width)' }}>
            <SeekBar value={progress} duration={duration} platform="desktop" onChange={onSeek} readout="inline" />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--spacing-lg)' }}>
          {!spoken && <IconButton icon="lyrics" label="Lyrics" onClick={press(onToggleLyrics)} active={lyricsOpen} tone="play-ink" pressed={lyricsOpen} />}
          <IconButton icon="queue_music" label="Queue" onClick={press(onToggleQueue)} active={queueOpen} tone="play-ink" pressed={queueOpen} />
          <IconButton icon="volume_up" label="Volume" onClick={press(onVolume)} />
        </div>
      </div>
    );
  }

  return (
    <div className="sn-int" role="button" aria-label={'Open player, ' + title} tabIndex={onOpen ? 0 : -1} aria-disabled={!onOpen}
      onClick={onOpen} onKeyDown={onOpen && activate(() => onOpen())}
      style={{
      display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)',
      padding: 'var(--spacing-md)', cursor: 'pointer', color: 'var(--surface-now-playing-fg)',
      background: 'var(--surface-now-playing)', ...INKS,
      overflow: 'visible', height: 48, boxSizing: 'content-box',
      borderTop: '1px solid var(--surface-border)', borderBottom: '1px solid var(--surface-border)',
    }}>
      <div style={{
        width: 'var(--art-xs)', height: 'var(--art-xs)', flexShrink: 0,
        borderRadius: 'var(--radius-xs)', overflow: 'hidden', background: image ? undefined : 'var(--art-gradient-end)',
      }}>
        {image && <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--surface-now-playing-fg)', fontFamily: 'var(--font-body)', fontWeight: 'var(--weight-strong)', fontSize: 'var(--text-lg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        <div style={{ color: 'var(--surface-now-playing-fg-muted)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artist}</div>
      </div>
      {play}
      {StateLayer && <StateLayer disabled={!onOpen} />}
    </div>
  );
}

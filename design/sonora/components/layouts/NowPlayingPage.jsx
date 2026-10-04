import React from 'react';
import { NS, sx } from '../shared.js';

/**
 * The player's first tab: cover, titles, then the controls matched to what plays. Music gets
 * shuffle, previous, next and repeat, its speed left to the menu, and a sleep timer row; spoken
 * content (a podcast, a book, a YouTube episode) gets speed, skip back and forward, and the sleep
 * timer, never previous or next. On desktop the player bar beneath the window carries the seek bar
 * and the transport (a spoken item's sleep timer too), so this tab leaves them out. `children` stack below: the about cards.
 */
export function NowPlayingPage({
  platform = 'mobile', variant = 'music', image, title, artist, context,
  playing = false, progress = 0, duration = 0,
  onTogglePlay, onPrev, onNext, onShuffle, onRepeat, onSeek,
  onSkipBack, onSkipForward, skipSeconds = 15,
  favourite, onFavourite,
  speed = 1, onSpeed, sleep = 'Off', onSleep,
  scroll, children,
}) {
  const { IconButton, ScrollArea, CoverArt, SeekBar, TransportBar, ValueRow, SpeedControl } = NS();
  const mobile = platform === 'mobile';
  const spoken = variant === 'spoken';
  const scrolls = scroll === undefined ? mobile : scroll;
  const pad = mobile ? 'var(--spacing-2xl)' : '0px';
  const gap = mobile ? 'var(--spacing-xl)' : 'var(--spacing-lg)';
  // Song, art and seek share one measure: the art's width, centred, with the seek bar inset a hair.
  const artWidth = mobile ? 'min(76%, var(--now-playing-art-max))' : '100%';
  // A word too wide for the phone's display step beside the favourite, as an episode's often is, takes
  // the desktop's step; a word wider still breaks rather than running under the favourite.
  const longWord = String(title || '').split(/\s+/).some((w) => w.length > 10);
  const sleeping = sleep !== 'Off';
  const sleepButton = IconButton && (
    <IconButton label={'Sleep timer, ' + sleep} active={sleeping} muted={!sleeping} size={mobile ? 'xl' : 'md'} onClick={onSleep} icon="bedtime" />
  );

  const body = (
    <div style={sx('display:flex;flex-direction:column;gap:' + gap + ';box-sizing:border-box;padding:' + (scrolls ? pad + ' ' + pad + ' var(--spacing-2xl)' : '0px'))}>
      <div style={sx('position:relative;overflow:hidden;align-self:center;aspect-ratio:1;flex-shrink:0;width:' + artWidth +
        ';border-radius:var(--radius-' + (mobile ? 'lg' : 'md') + ');background:var(--accent)')}>
        {CoverArt && <CoverArt src={image} alt={title ? title + ' cover' : ''} />}
      </div>
      <div style={sx('display:flex;align-items:flex-start;gap:var(--spacing-md);align-self:center;box-sizing:border-box;width:' + artWidth)}>
        <div style={sx('flex:1;min-width:0')}>
          <div style={sx('font-family:var(--font-display);font-weight:var(--weight-super-strong);font-stretch:var(--display-stretch);line-height:1.15;overflow-wrap:break-word;color:var(--surface-fg);font-size:' + (mobile && !longWord ? 'var(--text-4xl)' : 'var(--text-2xl)'))}>{title}</div>
          <div style={sx('margin-top:2px;color:var(--surface-fg-muted);font-size:' + (mobile ? 'var(--text-lg)' : 'var(--text-md)'))}>{artist}</div>
          {!mobile && context && <div style={sx('margin-top:6px;font-size:var(--text-sm);color:var(--surface-fg-muted)')}>{context}</div>}
        </div>
        {(favourite !== undefined || onFavourite) && IconButton && (
          <IconButton label={favourite ? 'Remove from favourites' : 'Add to favourites'} active={favourite} muted={!favourite} size={mobile ? 'lg' : 'sm'} onClick={onFavourite}
            icon={favourite ? 'favorite' : 'favorite_border'} />
        )}
      </div>
      {mobile && SeekBar && (
        <div style={sx('display:flex;margin:0 var(--spacing-sm)')}>
          <SeekBar value={progress} duration={duration} platform={platform} onChange={onSeek} />
        </div>
      )}
      {mobile && TransportBar && (spoken ? (
        <TransportBar variant="spoken" playing={playing} platform={platform} onTogglePlay={onTogglePlay}
          onSkipBack={onSkipBack} onSkipForward={onSkipForward} skipSeconds={skipSeconds}
          leading={SpeedControl && <SpeedControl value={speed} onClick={onSpeed} size={48} />}
          trailing={sleepButton} />
      ) : (
        <TransportBar playing={playing} platform={platform} onTogglePlay={onTogglePlay} onPrev={onPrev} onNext={onNext} onShuffle={onShuffle} onRepeat={onRepeat} />
      ))}
      {!spoken && ValueRow && <ValueRow platform={platform} label="Sleep timer" value={sleep} onClick={onSleep} />}
      {children}
    </div>
  );

  if (!scrolls) return body;
  return (
    <div style={sx('display:flex;flex-direction:column;flex:1;min-height:0')}>
      <ScrollArea>{body}</ScrollArea>
    </div>
  );
}

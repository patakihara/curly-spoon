/**
 * The docked mini player (docs/DESIGN.md § Layout: "always present when
 * something is loaded, docked above the bottom bar or at the foot of the
 * rail"). Renders purely from `playerStore` state — never `audio.currentTime`
 * directly — per `useAudioElement.ts`'s header: this app's e2e fixture audio
 * never actually decodes, so every interaction has to work from store state.
 */
import { Icon, IconButton, LinearProgress, Marquee } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { usePlayerStore } from '../../state/playerStore.js';

export interface MiniPlayerProps {
  /** Opens the full Now Playing surface — owned by whichever shell region hosts this. */
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const api = useApi();
  const currentItem = usePlayerStore((s) => s.currentItem);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);

  if (!currentItem) return null;

  const authors =
    currentItem.media.authors?.map((a) => a.name).join(', ') ?? currentItem.media.author ?? '';
  const progress = duration === 0 ? 0 : currentTime / duration;

  return (
    <div className="auralis-mini-player" data-testid="mini-player">
      <button
        type="button"
        className="auralis-mini-player__body"
        data-testid="mini-player-expand"
        onClick={onExpand}
        aria-label={`Open ${currentItem.media.title}`}
      >
        <img
          className="auralis-mini-player__cover"
          src={api.coverUrl(currentItem.id, { width: 96 })}
          alt=""
          width={48}
          height={48}
        />
        <span className="auralis-mini-player__text">
          <span className="auralis-mini-player__title" data-testid="mini-player-title">
            <Marquee>{currentItem.media.title}</Marquee>
          </span>
          {authors ? <span className="auralis-mini-player__author">{authors}</span> : null}
        </span>
      </button>
      <IconButton
        aria-label={isPlaying ? 'Pause' : 'Play'}
        data-testid="mini-player-play-toggle"
        onClick={() => (isPlaying ? pause() : play())}
      >
        <Icon name={isPlaying ? 'pause' : 'play'} />
      </IconButton>
      <div className="auralis-mini-player__progress">
        <LinearProgress value={progress} aria-label="Playback progress" />
      </div>
    </div>
  );
}

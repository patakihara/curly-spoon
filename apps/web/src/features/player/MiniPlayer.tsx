/**
 * The docked mini player (docs/DESIGN.md § Layout: "always present when
 * something is loaded, docked above the bottom bar or at the foot of the
 * rail"). Renders purely from `playerStore` state — never `audio.currentTime`
 * directly — per `useAudioElement.ts`'s header: this app's e2e fixture audio
 * never actually decodes, so every interaction has to work from store state.
 */
import { Icon, IconButton, LinearProgress, Marquee, type IconName } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { CoverImage } from '../../components/CoverImage.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { trackAt } from './playback.js';
import { playerArtworkUrl, playerDisplayMeta } from './playerUi.js';

/** Same glyph-per-kind mapping `Shell.tsx`'s `DESTINATION_ICONS` uses, for the
 * tonal fallback `CoverImage` renders when this cover 404s or otherwise fails
 * to decode — a bare `<img>` fell through to the browser's broken-image glyph
 * instead (web design audit, 2026-08-06). */
const COVER_FALLBACK_ICON: Record<'book' | 'podcast' | 'track', IconName> = {
  book: 'book_2',
  podcast: 'podcasts',
  track: 'music_note',
};

export interface MiniPlayerProps {
  /** Opens the full Now Playing surface — owned by whichever shell region hosts this. */
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: MiniPlayerProps) {
  const api = useApi();
  const currentItem = usePlayerStore((s) => s.currentItem);
  const episodeId = usePlayerStore((s) => s.episodeId);
  const displayTitle = usePlayerStore((s) => s.displayTitle);
  const tracks = usePlayerStore((s) => s.tracks);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);

  if (!currentItem) return null;

  const authors =
    currentItem.media.authors?.map((a) => a.name).join(', ') ?? currentItem.media.author ?? '';
  const { primary, secondary } = playerDisplayMeta({
    kind: currentItem.media.kind,
    episodeId,
    displayTitle,
    itemTitle: currentItem.media.title,
    authors,
    currentTrackTitle: trackAt(tracks, currentTime)?.track.title ?? null,
    currentTrackArtist: trackAt(tracks, currentTime)?.track.artist ?? null,
  });
  const progress = duration === 0 ? 0 : currentTime / duration;

  return (
    <div className="auralis-mini-player" data-testid="mini-player">
      <button
        type="button"
        className="auralis-mini-player__body"
        data-testid="mini-player-expand"
        onClick={onExpand}
        aria-label={`Open ${primary}`}
      >
        <CoverImage
          src={playerArtworkUrl(api, {
            kind: currentItem.media.kind,
            itemId: currentItem.id,
            width: 96,
          })}
          alt=""
          // Wave 16e-nowplaying (docs/design/screens/NOW_PLAYING.md §3.2): Sonora's
          // `--miniplayer-album-size` token is 44px; this was hardcoded to 48px, one of
          // this app's four uses of `TOUCH_TARGET_MIN` bleeding into a value that was
          // never actually a touch target (the whole `.auralis-mini-player__body` button
          // is the click target, not the cover art specifically). `CoverImage`'s `size`
          // prop is a plain number (CSS px), not a CSS-var-capable string, so this is a
          // literal 44 rather than `var(--miniplayer-album-size)` — widening `CoverImage`
          // to accept a token string would touch a component with nineteen other call
          // sites (`grep -rln "<CoverImage" apps/web/src`, ten other files) for a value
          // only this one needs.
          size={44}
          fallbackIcon={COVER_FALLBACK_ICON[currentItem.media.kind]}
          style={{ flexShrink: 0 }}
        />
        <span className="auralis-mini-player__text">
          <span className="auralis-mini-player__title" data-testid="mini-player-title">
            <Marquee>{primary}</Marquee>
          </span>
          {secondary ? (
            <span className="auralis-mini-player__author" data-testid="mini-player-author">
              {secondary}
            </span>
          ) : null}
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

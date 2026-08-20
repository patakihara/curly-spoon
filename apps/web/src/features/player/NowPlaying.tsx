/**
 * The full player surface (docs/DESIGN.md § Layout: full-screen sheet under
 * 600px, a split view 600–1240px, and the persistent side panel above that).
 * Same store-only rule as `MiniPlayer.tsx`: every value here comes from
 * `playerStore`/`settingsStore`, never `audio.currentTime`.
 *
 * Below 1240px this wraps its content in `Sheet` so it can be dismissed by
 * drag, scrim click or the close button alike; at the `expanded` breakpoint the
 * caller (`NowPlayingPanel.tsx`) embeds it directly in a persistent region, so
 * the sheet chrome would be redundant — this component decides which shape to
 * render itself, rather than making every caller repeat the breakpoint check.
 */
import { Icon, IconButton, Sheet, Slider } from '@auralis/ui';
import { useApi } from '../../api/ApiContext.js';
import { useBreakpoint } from '../../hooks/useBreakpoint.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { useMusicQueueStore } from '../../state/musicQueueStore.js';
import { useSettingsStore } from '../../state/settingsStore.js';
import { nextRepeatMode } from '../music/musicQueue.js';
import { BookmarkControls } from './BookmarkControls.js';
import { ChapterList } from './ChapterList.js';
import { LyricsView } from './LyricsView.js';
import { chapterAt, formatDuration, nextRate, trackAt } from './playback.js';
import {
  formatRemaining,
  nowPlayingContextLine,
  playerArtworkUrl,
  playerDisplayMeta,
} from './playerUi.js';
import { QueueView } from './QueueView.js';
import { SleepTimerControl } from './SleepTimerControl.js';

/** `aria-label` for the repeat control at each mode — see this file's own render for why a
 *  dynamic label rather than a bare "Repeat" is the accessible-name mechanism for a 3-state
 *  cycle button: `aria-pressed` (from `IconButton`'s `selected`) is fundamentally boolean, so
 *  it can only ever convey "some repeat is on"; the label is what actually distinguishes
 *  "all" from "one", and what tells assistive tech what the *next* click does — the same
 *  pattern browsers' own tri-state form controls (e.g. a mute button that also shows volume
 *  level) use when `aria-pressed`/`aria-checked` alone can't carry every state. */
const REPEAT_LABELS: Record<'off' | 'all' | 'one', string> = {
  off: 'Repeat off. Choose to repeat the whole queue.',
  all: 'Repeat queue. Choose to repeat just this track.',
  one: 'Repeat this track. Choose to turn repeat off.',
};

export interface NowPlayingProps {
  open: boolean;
  onClose: () => void;
}

export function NowPlaying({ open, onClose }: NowPlayingProps) {
  const breakpoint = useBreakpoint();
  const api = useApi();
  const currentItem = usePlayerStore((s) => s.currentItem);
  const episodeId = usePlayerStore((s) => s.episodeId);
  const displayTitle = usePlayerStore((s) => s.displayTitle);
  const tracks = usePlayerStore((s) => s.tracks);
  const chapters = usePlayerStore((s) => s.chapters);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const play = usePlayerStore((s) => s.play);
  const pause = usePlayerStore((s) => s.pause);
  const seek = usePlayerStore((s) => s.seek);
  const skip = usePlayerStore((s) => s.skip);
  const setRate = usePlayerStore((s) => s.setRate);
  const skipBackSeconds = useSettingsStore((s) => s.skipBackSeconds);
  const skipForwardSeconds = useSettingsStore((s) => s.skipForwardSeconds);
  const queue = useMusicQueueStore((s) => s.queue);
  const toggleShuffle = useMusicQueueStore((s) => s.toggleShuffle);
  const setRepeat = useMusicQueueStore((s) => s.setRepeat);

  // Only `currentItem` gates mounting — `open` must NOT, even though it reads as the
  // obvious guard. Below `expanded` this component's content lives inside `Sheet`
  // (Mantine `Drawer`), and Mantine's return-focus-on-close behaviour is wired to its own
  // `opened` prop transitioning on a component that stays mounted, not to unmount
  // cleanup. Early-returning `null` here the instant `open` goes false used to unmount
  // `Sheet`'s `Drawer.Root` synchronously in the same render — removing it from the tree
  // before Mantine ever observed `opened: true -> false` — so focus was left on `<body>`
  // instead of returning to whatever opened the sheet (found in the phase-10 a11y audit;
  // `e2e/app/player.spec.ts`'s "returns focus to the mini player's expand control" test).
  // `packages/ui/gallery/App.tsx`'s own `<Sheet>` never hit this because its wrapper never
  // unmounts `Sheet` either — only `open` toggles — which is why `e2e/ui/sheet.spec.ts`
  // passed in isolation while the app-level behaviour was broken.
  if (!currentItem) return null;

  // Shuffle/repeat are music-only — `currentItem.media.kind === 'track'` is the same signal
  // `playerDisplayMeta`/`playerArtworkUrl` already use to tell a Jellyfin queue apart from a
  // real Audiobookshelf item (see this file's imports). Gating on `queue` too, rather than
  // on `kind` alone, is what keeps a stale queue left over from a previous music session
  // inert the moment a book or podcast episode is loaded — see `state/musicQueueStore.ts`'s
  // own header for why nothing needs to actively clear it on an unrelated `load()`.
  const showQueueControls = currentItem.media.kind === 'track' && queue !== null;

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
  const chapter = chapterAt(chapters, currentTime);
  // Music only (§6.3) — `currentItem.media.title` is the album/playlist container's own
  // name for a track-kind item (see `nowPlayingContextLine`'s own doc comment for why),
  // never composed for a book or podcast, which already show their own equivalent
  // context (author, or the podcast's title as `secondary`/the chapter line above).
  const contextLine =
    currentItem.media.kind === 'track' ? nowPlayingContextLine(currentItem.media.title) : null;

  const content = (
    <div
      className={`auralis-now-playing auralis-now-playing--${breakpoint}`}
      data-testid="now-playing"
    >
      <div className="auralis-now-playing__header">
        <IconButton aria-label="Close" data-testid="now-playing-close" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>

      <img
        className="auralis-now-playing__art"
        src={playerArtworkUrl(api, {
          kind: currentItem.media.kind,
          itemId: currentItem.id,
          width: 640,
        })}
        alt=""
      />

      <div className="auralis-now-playing__meta">
        <h1 className="auralis-now-playing__title">{primary}</h1>
        {secondary ? (
          <p className="auralis-now-playing__author" data-testid="now-playing-author">
            {secondary}
          </p>
        ) : null}
        {contextLine ? (
          <p className="auralis-now-playing__context" data-testid="now-playing-context">
            {contextLine}
          </p>
        ) : null}
        <p data-testid="now-playing-chapter">{chapter?.title ?? ''}</p>
      </div>

      <div className="auralis-now-playing__scrubber">
        <Slider
          data-testid="player-scrubber"
          aria-label="Seek"
          min={0}
          max={duration}
          value={currentTime}
          valueText={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
          onChange={(value) => seek(value)}
        />
        <div className="auralis-now-playing__times">
          <span data-testid="player-elapsed">{formatDuration(currentTime)}</span>
          <span data-testid="player-remaining">{formatRemaining(currentTime, duration)}</span>
        </div>
      </div>

      {/* Wave 16e-nowplaying (§3.3): three distinct transport sizes, Sonora's mobile-sheet
          values (48/56/72) applied uniformly rather than only below `expanded` — this row
          is one shared JSX tree at every breakpoint (§3.1's "single scrolling stack"
          ruling), and §3.3's table gives no separate desktop-panel row for these sizes.
          Web has no Prev/Next tier (§6.6, §7 — Android-only); skip back/forward take the
          56px tier Sonora reserves for the buttons flanking Play/Pause, which is the role
          they play here. Play/Pause was already `variant="filled"` (accent fill, already
          correct per §3.3) and only needed the new size, not new colour logic. */}
      <div className="auralis-now-playing__transport">
        <IconButton
          size={56}
          aria-label={`Skip back ${skipBackSeconds} seconds`}
          data-testid="player-skip-back"
          onClick={() => skip(-skipBackSeconds)}
        >
          <Icon name="replay_30" />
        </IconButton>
        <IconButton
          variant="filled"
          size={72}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          data-testid="player-play-toggle"
          onClick={() => (isPlaying ? pause() : play())}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} />
        </IconButton>
        <IconButton
          size={56}
          aria-label={`Skip forward ${skipForwardSeconds} seconds`}
          data-testid="player-skip-forward"
          onClick={() => skip(skipForwardSeconds)}
        >
          <Icon name="forward_30" />
        </IconButton>
      </div>

      {showQueueControls && queue ? (
        <div className="auralis-now-playing__queue">
          <IconButton
            aria-label="Shuffle"
            data-testid="player-shuffle-toggle"
            selected={queue.shuffled}
            onSelectedChange={() => toggleShuffle()}
          >
            <Icon name="shuffle" />
          </IconButton>
          <IconButton
            aria-label={REPEAT_LABELS[queue.repeat]}
            data-testid="player-repeat-toggle"
            selected={queue.repeat !== 'off'}
            onClick={() => setRepeat(nextRepeatMode(queue.repeat))}
          >
            <Icon name="repeat" />
            {queue.repeat === 'one' ? (
              <span className="auralis-now-playing__repeat-badge" aria-hidden="true">
                1
              </span>
            ) : null}
          </IconButton>
        </div>
      ) : null}

      <QueueView />

      {/* Wave 16e-nowplaying (§3.3): "two side-by-side pills" — the rate control and the
          sleep timer, each its own pill (padding, radius, background). The rate group
          needs a new wrapper to become one pill; `SleepTimerControl` already renders its
          own `.auralis-sleep-timer` root, so that one's pill styling lands directly on an
          existing class rather than a new wrapper. */}
      <div className="auralis-now-playing__rate">
        <div className="auralis-now-playing__rate-pill">
          <IconButton
            aria-label="Slower"
            data-testid="player-rate-decrease"
            onClick={() => setRate(nextRate(playbackRate, -1))}
          >
            <Icon name="speed" />
          </IconButton>
          <span data-testid="player-rate">{playbackRate}x</span>
          <IconButton
            aria-label="Faster"
            data-testid="player-rate-increase"
            onClick={() => setRate(nextRate(playbackRate, 1))}
          >
            <Icon name="speed" />
          </IconButton>
        </div>
        <SleepTimerControl />
      </div>

      <ChapterList />
      <LyricsView />
      <BookmarkControls />
    </div>
  );

  if (breakpoint === 'expanded') return content;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      detents={breakpoint === 'compact' ? [1] : [0.9]}
      aria-label="Now playing"
    >
      {content}
    </Sheet>
  );
}

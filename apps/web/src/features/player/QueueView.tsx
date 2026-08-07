/**
 * The queue surface for whichever content type is currently playing — reads only
 * `queueContentTypeOf(currentItem)`'s own queue store, never a merged view across the three
 * (docs/ROADMAP.md §12f, requirement 1: switching content types must never clear, or leak
 * into, an unrelated queue). Mounted from `NowPlaying.tsx` beside the existing music-only
 * shuffle/repeat controls, but this view itself renders for every content type.
 *
 * `buildQueueEntries` is exported separately from the component so it can be unit-tested on
 * its own: this workspace has neither `jsdom` nor `@testing-library/react` installed as a
 * dependency anywhere (checked before writing this file — `vitest.config.ts`'s `include` only
 * globs `apps/web/src/**\/*.test.ts`, `.tsx` isn't included, and neither package appears in any
 * `package.json` in the repo), and this wave's rules forbid `pnpm add`. So `QueueView.test.tsx`
 * exercises the pure list-building logic below; actual rendering, the clear-queue click, and
 * the "current entry marked" accessibility behaviour are covered by `e2e/app/queue-view.spec.ts`
 * in a real browser instead, where a DOM genuinely exists.
 */
import { Button, Icon, ListItem } from '@auralis/ui';
import { usePlayerStore } from '../../state/playerStore.js';
import { useMusicQueueStore } from '../../state/musicQueueStore.js';
import { usePodcastQueueStore } from '../../state/podcastQueueStore.js';
import { useAudiobookQueueStore } from '../../state/audiobookQueueStore.js';
import type { MusicQueueState } from '../music/musicQueue.js';
import type { SimpleQueueState } from '../../state/createQueueStore.js';
import { queueContentTypeOf } from './queueRouter.js';
import type { AudiobookQueueEntry, PodcastQueueEntry, QueueContentType } from './queueEntries.js';

export interface QueueViewEntry {
  key: string;
  headline: string;
  supportingText: string | null;
  /** Marks the entry the queue's own cursor currently sits on — not necessarily the same
   *  thing `playerStore.currentItem` is playing (a book/track can be loaded without ever
   *  having gone through its queue), but the best available "you are here" signal a queue
   *  view can show, and the same cursor concept all three stores already expose. */
  current: boolean;
}

const TITLES: Record<QueueContentType, string> = {
  music: 'Music queue',
  podcast: 'Podcast queue',
  audiobook: 'Audiobook queue',
};

const EMPTY_MESSAGES: Record<QueueContentType, string> = {
  music: 'Nothing queued after this track.',
  podcast: 'No podcast episodes queued.',
  audiobook: 'No chapters or books queued.',
};

/**
 * Builds the display list for whichever content type is loaded, from that type's own queue
 * state alone. `null` means nothing of that type is queued at all (the caller renders the
 * empty state); an entry list is always non-empty when returned, since every one of the three
 * stores represents "nothing queued" as `queue: null`, never as `order: []` (see
 * `createQueueStore.ts` and `musicQueueStore.ts`'s own `clearQueue`).
 *
 * Shows the *upcoming* entries — from the queue's own cursor to its end — with the cursor's
 * own entry marked `current`, mirroring how `ChapterList.tsx`/`BookmarkControls.tsx` already
 * mark "the one that's current" rather than listing history the user has already passed.
 */
export function buildQueueEntries(
  contentType: QueueContentType | null,
  music: MusicQueueState | null,
  podcast: SimpleQueueState<PodcastQueueEntry> | null,
  audiobook: SimpleQueueState<AudiobookQueueEntry> | null,
): QueueViewEntry[] | null {
  switch (contentType) {
    case 'music': {
      if (!music) return null;
      return music.positions.slice(music.cursor).map((originalIndex, i) => {
        const track = music.order[originalIndex];
        return {
          key: `music-${originalIndex}`,
          headline: track?.title ?? '',
          supportingText: track?.artist ?? null,
          current: i === 0,
        };
      });
    }
    case 'podcast': {
      if (!podcast) return null;
      return podcast.order.slice(podcast.cursor).map((entry, i) => ({
        key: `podcast-${podcast.cursor + i}-${entry.episodeId}`,
        headline: entry.title,
        supportingText: entry.podcastTitle,
        current: i === 0,
      }));
    }
    case 'audiobook': {
      if (!audiobook) return null;
      return audiobook.order.slice(audiobook.cursor).map((entry, i) => ({
        key: `audiobook-${audiobook.cursor + i}-${entry.kind === 'chapter' ? entry.chapterId : entry.itemId}`,
        headline: entry.title,
        supportingText: entry.kind === 'chapter' ? entry.bookTitle : null,
        current: i === 0,
      }));
    }
    case null:
      return null;
  }
}

export function QueueView() {
  const currentItem = usePlayerStore((s) => s.currentItem);
  const musicQueue = useMusicQueueStore((s) => s.queue);
  const clearMusicQueue = useMusicQueueStore((s) => s.clearQueue);
  const podcastQueue = usePodcastQueueStore((s) => s.queue);
  const clearPodcastQueue = usePodcastQueueStore((s) => s.clearQueue);
  const audiobookQueue = useAudiobookQueueStore((s) => s.queue);
  const clearAudiobookQueue = useAudiobookQueueStore((s) => s.clearQueue);

  const contentType = queueContentTypeOf(currentItem);
  if (!contentType) return null;

  const entries = buildQueueEntries(contentType, musicQueue, podcastQueue, audiobookQueue);

  // Each type's `clearQueue` only ever touches its own store (see every store's own doc
  // comment) — picking the right one here, rather than exposing a generic "clear whatever's
  // loaded" action, is what keeps that guarantee visible at the call site.
  const clearQueue =
    contentType === 'music'
      ? clearMusicQueue
      : contentType === 'podcast'
        ? clearPodcastQueue
        : clearAudiobookQueue;

  return (
    <div className="auralis-queue-view" data-testid="queue-view">
      <div className="auralis-queue-view__header">
        <h2 className="auralis-queue-view__title">{TITLES[contentType]}</h2>
        <Button
          variant="text"
          leadingIcon={<Icon name="close" />}
          data-testid="queue-clear"
          // Clearing the up-next list is not the same as closing the player — this calls
          // only the current type's `clearQueue()`, never `playerStore.close()`, so whatever
          // is currently loaded and playing keeps playing.
          onClick={() => clearQueue()}
        >
          Clear queue
        </Button>
      </div>
      {entries === null ? (
        <p className="auralis-queue-view__empty" data-testid="queue-empty">
          {EMPTY_MESSAGES[contentType]}
        </p>
      ) : (
        <ul
          className="auralis-queue-view__list"
          data-testid="queue-list"
          role="list"
          aria-label={TITLES[contentType]}
        >
          {entries.map((entry) => (
            // `data-testid` sits on the `<li>`, not `ListItem` itself: `ListItem`'s
            // non-interactive (`interactive={false}`) branch renders a bare Mantine `Box`
            // that only forwards `className`/`aria-current`, not the rest of its props
            // (`packages/ui/src/components/ListItem.tsx`) — out of scope to change here.
            // `aria-current` (set from `selected` below) is what actually marks the current
            // entry for assistive tech; the testid is only for `e2e/app/queue-view.spec.ts`.
            <li key={entry.key} data-testid={`queue-entry-${entry.key}`}>
              <ListItem
                interactive={false}
                headline={entry.headline}
                supportingText={entry.supportingText ?? undefined}
                selected={entry.current}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

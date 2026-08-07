/**
 * Chapter list inside Now Playing — a `ListItem` per chapter, driven entirely by
 * `playerStore` state (see `MiniPlayer.tsx`'s header for why: never `<audio>`
 * directly). `ListItem`'s own `selected` prop already renders `aria-current`,
 * so the "which chapter is playing" state doesn't need a bespoke attribute here.
 *
 * Each chapter also gets two enqueue actions — "Play next" and "Play last" — building an
 * `AudiobookQueueEntry` of `kind: 'chapter'` (docs/ROADMAP.md §12f, requirement 3: audiobook
 * chapters must be queueable). Rendered as sibling `IconButton`s next to `ListItem`, exactly
 * `BookmarkControls.tsx`'s `.auralis-bookmarks__row` pattern — `ListItem` renders a `<button>`
 * of its own, and a `<button>` inside a `<button>` is invalid HTML.
 *
 * Enqueueing is gated on `queueContentTypeOf(currentItem) === 'audiobook'` rather than merely
 * "chapters exist": `chapters` here is `playerStore`'s own field, populated from whatever
 * `PlaybackSession` is currently open, and the audiobook queue is the only one of the three
 * `AudiobookQueueEntry` was built for — this check is what stops a chapter accidentally
 * enqueueing into it from a context that isn't actually an audiobook.
 */
import { Icon, IconButton, ListItem } from '@auralis/ui';
import { usePlayerStore } from '../../state/playerStore.js';
import { useAudiobookQueueStore } from '../../state/audiobookQueueStore.js';
import { chapterAt, formatDuration } from './playback.js';
import type { AudiobookQueueEntry } from './queueEntries.js';
import { queueContentTypeOf } from './queueRouter.js';
import type { Chapter, LibraryItem } from '../../api/types.js';

/** A chapter has no URL of its own — this is the one place a `Chapter` marker turns into a
 *  queueable `AudiobookQueueEntry`; `audiobookQueueController.ts`'s `handleAudiobookQueueEnded`
 *  is what actually resolves it ("load the book, then seek to `start`") when its turn comes. */
export function chapterToQueueEntry(chapter: Chapter, item: LibraryItem): AudiobookQueueEntry {
  return {
    kind: 'chapter',
    itemId: item.id,
    chapterId: String(chapter.id),
    title: chapter.title,
    bookTitle: item.media.title,
    start: chapter.start,
  };
}

export function ChapterList() {
  const currentItem = usePlayerStore((s) => s.currentItem);
  const chapters = usePlayerStore((s) => s.chapters);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);
  const enqueueNext = useAudiobookQueueStore((s) => s.enqueueNext);
  const enqueueLast = useAudiobookQueueStore((s) => s.enqueueLast);

  if (chapters.length === 0 || !currentItem) return null;

  const current = chapterAt(chapters, currentTime);
  const canQueue = queueContentTypeOf(currentItem) === 'audiobook';

  return (
    <ul className="auralis-chapter-list" data-testid="chapter-list">
      {chapters.map((chapter) => (
        <li className="auralis-chapter-list__row" key={chapter.id}>
          <ListItem
            data-testid={`chapter-item-${chapter.id}`}
            headline={chapter.title}
            supportingText={formatDuration(chapter.start)}
            selected={current?.id === chapter.id}
            onClick={() => seek(chapter.start)}
          />
          {canQueue ? (
            <>
              <IconButton
                aria-label={`Play next: ${chapter.title}`}
                data-testid={`chapter-play-next-${chapter.id}`}
                onClick={() => enqueueNext(chapterToQueueEntry(chapter, currentItem))}
              >
                <Icon name="skip_next" />
              </IconButton>
              <IconButton
                aria-label={`Play last: ${chapter.title}`}
                data-testid={`chapter-play-last-${chapter.id}`}
                onClick={() => enqueueLast(chapterToQueueEntry(chapter, currentItem))}
              >
                <Icon name="add" />
              </IconButton>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

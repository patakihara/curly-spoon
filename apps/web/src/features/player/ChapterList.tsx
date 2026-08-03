/**
 * Chapter list inside Now Playing — a `ListItem` per chapter, driven entirely by
 * `playerStore` state (see `MiniPlayer.tsx`'s header for why: never `<audio>`
 * directly). `ListItem`'s own `selected` prop already renders `aria-current`,
 * so the "which chapter is playing" state doesn't need a bespoke attribute here.
 */
import { ListItem } from '@auralis/ui';
import { usePlayerStore } from '../../state/playerStore.js';
import { chapterAt, formatDuration } from './playback.js';

export function ChapterList() {
  const chapters = usePlayerStore((s) => s.chapters);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const seek = usePlayerStore((s) => s.seek);

  if (chapters.length === 0) return null;

  const current = chapterAt(chapters, currentTime);

  return (
    <ul className="auralis-chapter-list" data-testid="chapter-list">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <ListItem
            data-testid={`chapter-item-${chapter.id}`}
            headline={chapter.title}
            supportingText={formatDuration(chapter.start)}
            selected={current?.id === chapter.id}
            onClick={() => seek(chapter.start)}
          />
        </li>
      ))}
    </ul>
  );
}

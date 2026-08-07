/**
 * Unit coverage for `QueueView.tsx`'s exported `buildQueueEntries` — the pure list-building
 * logic behind the component. See `QueueView.tsx`'s own header for why this file tests that
 * function directly rather than rendering the component: this workspace has no `jsdom`/
 * `@testing-library/react` (neither is a dependency anywhere in the repo, and this wave may
 * not `pnpm add`), so a real DOM render isn't available here. Rendering, the clear-queue
 * click, and "current entry marked" behaviour are covered in a real browser instead, by
 * `e2e/app/queue-view.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { buildQueueEntries } from './QueueView.js';
import type { MusicQueueState, QueueTrack } from '../music/musicQueue.js';
import type { SimpleQueueState } from '../../state/createQueueStore.js';
import type { AudiobookQueueEntry, PodcastQueueEntry } from './queueEntries.js';

function track(id: string, title: string, artist: string | null): QueueTrack {
  return { id, title, durationSeconds: 200, artist };
}

function musicQueue(order: QueueTrack[], cursor: number): MusicQueueState {
  return {
    order,
    total: order.length,
    positions: order.map((_, i) => i),
    cursor,
    shuffled: false,
    repeat: 'off',
  };
}

describe('buildQueueEntries', () => {
  it('returns null for no content type loaded', () => {
    expect(buildQueueEntries(null, null, null, null)).toBeNull();
  });

  it('returns null for a content type with nothing queued', () => {
    expect(buildQueueEntries('music', null, null, null)).toBeNull();
    expect(buildQueueEntries('podcast', null, null, null)).toBeNull();
    expect(buildQueueEntries('audiobook', null, null, null)).toBeNull();
  });

  it('shows upcoming music entries from the cursor onward, marking the cursor entry current', () => {
    const queue = musicQueue(
      [
        track('t1', 'Tidal Lines', 'Nebula'),
        track('t2', 'Static Coast', 'Nebula'),
        track('t3', 'Hollow', 'Echo'),
      ],
      1,
    );
    const entries = buildQueueEntries('music', queue, null, null);

    expect(entries).toEqual([
      { key: 'music-1', headline: 'Static Coast', supportingText: 'Nebula', current: true },
      { key: 'music-2', headline: 'Hollow', supportingText: 'Echo', current: false },
    ]);
  });

  it('shows each music entry’s own per-track artist, never a fixed album artist', () => {
    // Two tracks with genuinely different artists — nothing in `QueueTrack` carries an
    // "album artist" at all, so this proves the field displayed is the track's own, not a
    // stand-in the album/queue level provides (see `docs/HANDOVER.md`'s note on the web
    // per-track-artist bug this wave must not repeat).
    const queue = musicQueue(
      [track('t1', 'Solo A', 'Artist One'), track('t2', 'Solo B', 'Artist Two')],
      0,
    );
    const entries = buildQueueEntries('music', queue, null, null);

    expect(entries?.[0]).toMatchObject({ headline: 'Solo A', supportingText: 'Artist One' });
    expect(entries?.[1]).toMatchObject({ headline: 'Solo B', supportingText: 'Artist Two' });
  });

  it('degrades a music entry with no artist to a null supportingText, not a crash', () => {
    const queue = musicQueue([track('t1', 'No Artist Track', null)], 0);
    const entries = buildQueueEntries('music', queue, null, null);

    expect(entries).toEqual([
      { key: 'music-0', headline: 'No Artist Track', supportingText: null, current: true },
    ]);
  });

  it('shows upcoming podcast entries with the podcast title as supporting text', () => {
    const podcast: SimpleQueueState<PodcastQueueEntry> = {
      order: [
        { itemId: 'pod-1', episodeId: 'ep-1', title: 'Episode One', podcastTitle: 'The Show' },
        { itemId: 'pod-1', episodeId: 'ep-2', title: 'Episode Two', podcastTitle: 'The Show' },
      ],
      cursor: 0,
    };
    const entries = buildQueueEntries('podcast', null, podcast, null);

    expect(entries).toEqual([
      { key: 'podcast-0-ep-1', headline: 'Episode One', supportingText: 'The Show', current: true },
      {
        key: 'podcast-1-ep-2',
        headline: 'Episode Two',
        supportingText: 'The Show',
        current: false,
      },
    ]);
  });

  it('shows upcoming audiobook entries, chapters carrying their book title, whole books carrying none', () => {
    const audiobook: SimpleQueueState<AudiobookQueueEntry> = {
      order: [
        {
          kind: 'chapter',
          itemId: 'book-1',
          chapterId: '2',
          title: 'Part Two',
          bookTitle: 'Dune',
          start: 630,
        },
        { kind: 'item', itemId: 'book-2', title: 'Another Book' },
      ],
      cursor: 0,
    };
    const entries = buildQueueEntries('audiobook', null, null, audiobook);

    expect(entries).toEqual([
      { key: 'audiobook-0-2', headline: 'Part Two', supportingText: 'Dune', current: true },
      { key: 'audiobook-1-book-2', headline: 'Another Book', supportingText: null, current: false },
    ]);
  });

  it('never reads the other two content types’ queues for a given content type', () => {
    // A podcast/audiobook queue populated alongside a music one must not leak into the music
    // view, and vice versa — docs/ROADMAP.md §12f, requirement 1.
    const music = musicQueue([track('t1', 'Song', 'Artist')], 0);
    const podcast: SimpleQueueState<PodcastQueueEntry> = {
      order: [{ itemId: 'pod-1', episodeId: 'ep-1', title: 'Episode', podcastTitle: 'Show' }],
      cursor: 0,
    };

    const musicEntries = buildQueueEntries('music', music, podcast, null);
    expect(musicEntries).toEqual([
      { key: 'music-0', headline: 'Song', supportingText: 'Artist', current: true },
    ]);

    const podcastEntries = buildQueueEntries('podcast', music, podcast, null);
    expect(podcastEntries).toEqual([
      { key: 'podcast-0-ep-1', headline: 'Episode', supportingText: 'Show', current: true },
    ]);
  });
});

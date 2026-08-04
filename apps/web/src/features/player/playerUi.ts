/**
 * Pure helpers for the player UI components — kept apart from the components
 * themselves so they can be exercised without a DOM (this repo runs Vitest in
 * the `node` environment only; component behaviour is covered by Playwright).
 */
import type { Chapter } from '../../api/types.js';
import { chapterAt, formatDuration } from './playback.js';

/**
 * Seconds left in the item, never negative — a `currentTime` that has drifted
 * past `duration` (rounding at the very end of a seek) still reads as "no time
 * left" rather than a confusing negative number.
 */
export function remainingSeconds(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, duration - currentTime);
}

/**
 * The "-1:02:03" remaining-time label for the transport row. Always prefixed,
 * even at zero ("-0:00"), so the label never jumps to a bare positive number as
 * playback approaches the end — the leading `-` is what tells it apart from the
 * elapsed label at a glance.
 */
export function formatRemaining(currentTime: number, duration: number): string {
  return `-${formatDuration(remainingSeconds(currentTime, duration))}`;
}

/**
 * Milliseconds until the end of whichever chapter `time` currently falls in —
 * what the sleep timer's "End of chapter" option needs. `null` when there is no
 * current chapter (an empty chapter list), so the caller can degrade by not
 * offering that option's effect rather than guessing a duration.
 */
export function endOfChapterMs(chapters: Chapter[], time: number): number | null {
  const chapter = chapterAt(chapters, time);
  if (!chapter) return null;
  return Math.max(0, (chapter.end - time) * 1000);
}

/**
 * A new bookmark's default title: the chapter it falls in, or — for a book with
 * no chapter data — its own timestamp, so every bookmark still reads as
 * something meaningful in the list instead of a blank line.
 */
export function defaultBookmarkTitle(chapters: Chapter[], time: number): string {
  return chapterAt(chapters, time)?.title ?? formatDuration(time);
}

export interface PlayerDisplayMeta {
  /** The large, primary line — a book's own title, or an episode's own title. */
  primary: string;
  /** The smaller line underneath — a book's author, or the podcast an episode belongs to. */
  secondary: string;
}

/**
 * What the transport surfaces (mini player, Now Playing, the OS media session) show as
 * the loaded item's title and subtitle.
 *
 * `playerStore`'s `currentItem` is always the *library item* — for an episode, that's the
 * podcast container, per `PodcastDetailPage.tsx`'s header comment (a podcast has no single
 * audio stream of its own, so there's nothing else to pass `load()`). Reading the title
 * straight off `currentItem` therefore showed the podcast's name for every one of its
 * episodes — the single most visible place in the app displaying the wrong information for
 * a podcast listener. `PlaybackSession.displayTitle` is the fix: Audiobookshelf's `/play`
 * response already returns the *episode's* own title there when `episodeId` is set (the
 * session is scoped to what's actually playing, not the container `load()` was handed
 * alongside it) — this function is what promotes it to primary billing and demotes the
 * podcast's own title to the secondary line, mirroring how a book shows title-over-author.
 *
 * `displayTitle` falling back to `itemTitle` guards a session that arrives with a blank
 * `displayTitle` (normalized from an absent upstream field) from surfacing an empty title
 * instead of degrading to the one piece of chrome that's always present.
 */
export function playerDisplayMeta(params: {
  episodeId: string | null;
  displayTitle: string;
  itemTitle: string;
  authors: string;
}): PlayerDisplayMeta {
  if (params.episodeId) {
    return { primary: params.displayTitle || params.itemTitle, secondary: params.itemTitle };
  }
  return { primary: params.itemTitle, secondary: params.authors };
}

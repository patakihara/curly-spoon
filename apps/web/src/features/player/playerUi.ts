/**
 * Pure helpers for the player UI components — kept apart from the components
 * themselves so they can be exercised without a DOM (this repo runs Vitest in
 * the `node` environment only; component behaviour is covered by Playwright).
 */
import type { ApiClient } from '../../api/client.js';
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
 *
 * `kind: 'track'` (Phase 9 web wave) bills the same way as an episode — its own title over
 * its container's — but can't reuse `displayTitle` to get there: `displayTitle` is fixed at
 * `load()` time, and a Jellyfin album queue is loaded *once*, for every track in it (see
 * `features/music/queue.ts`), not once per track the way an Audiobookshelf episode session
 * is. Billing straight off `displayTitle` would show track 1's title for the whole album.
 * `currentTrackTitle` — `trackAt(tracks, currentTime)?.track.title`, computed fresh by the
 * caller on every render — is the thing that actually changes as playback crosses track
 * boundaries; `displayTitle` (frozen at track 1) and then `itemTitle` (the album's own name)
 * are only the degrade path, for the moment right at load before a position is known and
 * `trackAt` has nothing to resolve. Secondary billing is the artist, never the album name —
 * unlike an episode, which bills its container's title as the secondary line, a track's
 * album is *not* the equivalent of "which show this episode belongs to" for a listener's
 * purposes, so this reuses the `authors` slot instead (the caller passes artist names into
 * it, exactly as the book branch already reuses it for the book's own author).
 */
export function playerDisplayMeta(params: {
  kind: 'book' | 'podcast' | 'track';
  episodeId: string | null;
  displayTitle: string;
  itemTitle: string;
  authors: string;
  /** Only read when `kind` is `'track'` — see this function's own doc comment. */
  currentTrackTitle?: string | null;
}): PlayerDisplayMeta {
  if (params.kind === 'track') {
    return {
      primary: params.currentTrackTitle || params.displayTitle || params.itemTitle,
      secondary: params.authors,
    };
  }
  if (params.episodeId) {
    return { primary: params.displayTitle || params.itemTitle, secondary: params.itemTitle };
  }
  return { primary: params.itemTitle, secondary: params.authors };
}

/**
 * The cover-art URL for whatever's currently loaded, from `kind` and the right id — not
 * part of `PlaybackSource` (`features/player/playbackSource.ts`) even though it looks like
 * a sibling of `resolveTrackUrl`: the three transport surfaces (mini player, Now Playing,
 * the OS media session) each want a *different pixel width* for the same image, and
 * `PlaybackSource` has no notion of "resize this" — folding it in there would mean adding a
 * width parameter to every implementation, including `audiobookshelfSource`, which this
 * wave does not touch. Keeping the decision here, pure and tested like `playerDisplayMeta`,
 * gets the same "no ad-hoc branch per component" benefit without that.
 *
 * `itemId` is `playerStore.currentItem.id` in both cases — for a book or podcast that's the
 * real Audiobookshelf item id `coverUrl` expects; for a track it's the *album's* Jellyfin
 * id (`features/music/MusicAlbumPage.tsx` sets `currentItem.id` to `albumId` for exactly
 * this reason), which is what `jellyfinArtworkUrl` expects. Jellyfin's proxied artwork route
 * has no resize parameter, so `width` is accepted for a uniform call shape across `kind`s
 * but only actually used on the Audiobookshelf path.
 */
export function playerArtworkUrl(
  api: Pick<ApiClient, 'coverUrl' | 'jellyfinArtworkUrl'>,
  params: { kind: 'book' | 'podcast' | 'track'; itemId: string; width: number },
): string {
  if (params.kind === 'track') return api.jellyfinArtworkUrl(params.itemId);
  return api.coverUrl(params.itemId, { width: params.width });
}

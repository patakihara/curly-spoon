/**
 * The seam between the player and whatever upstream is actually playing.
 *
 * Two upstreams exist: an Audiobookshelf playback session (a book, or — scoped by
 * `PlaybackSession.episodeId` — a podcast episode; the same `/sessions/:id/sync`/`/close`
 * pair serves both, so this is one implementation, not two, per `client.ts`'s own
 * `playEpisode` doc comment), and — since Phase 9's web wave — a Jellyfin album queue
 * (`jellyfinSource`, fed by `features/music/queue.ts`). Each owns two things a
 * source-agnostic player cannot know on its own: how to turn a measured stretch of
 * listening into an upstream report (`reportProgress`), and how to turn one of the item's
 * tracks into a URL `<audio>` can actually load (`resolveTrackUrl`).
 *
 * What is deliberately *not* part of this interface: opening the session.
 * `POST /items/:id/play(/:episodeId)` is a network round-trip with its own
 * loading/error UI, already handled by `usePlayItemMutation`/
 * `usePlayEpisodeMutation` at the call site (`ItemPage.tsx`/
 * `PodcastDetailPage.tsx`) — its result (`PlaybackSession`) is exactly what
 * `playerStore.load()` needs to populate tracks/chapters/duration/currentTime.
 * `jellyfinSource` confirms this split was the right call: it has no "start" step at all
 * (Jellyfin's stream URL needs nothing opened upstream, so `MusicAlbumPage.tsx` builds a
 * `PlaybackSession`-shaped value client-side, synchronously — see its own comment), which
 * would have been an awkward shared return type to have guessed at ahead of a real second
 * implementation to design it against.
 */
import type { ApiClient } from '../../api/client.js';
import type { AudioTrack } from '../../api/types.js';
import { fileIdFromContentUrl } from './playback.js';
import type { ProgressSyncBody } from './progressSync.js';

/**
 * What `useProgressSync` does with a measured stretch of listening, once
 * `progressSync.ts`'s pure `progressSyncPayload` has turned it into a body (or
 * withheld one, when `duration` isn't known yet). The hook still owns *when*
 * to call these — the 15s interval, `pagehide`, and the wall-clock
 * accumulation `progressSync.ts`'s own header describes — this interface is
 * only ever asked "given this body (or its absence), what do you do."
 *
 * A reporter must never throw synchronously: `onEnd` runs from a `useEffect`
 * cleanup, which cannot usefully catch or retry a throw. Every implementation
 * here treats failure as "the position stays slightly stale" (see
 * `useProgressSync.ts`'s header) rather than surfacing it.
 */
export interface PlaybackProgressReporter {
  /**
   * Called on the periodic interval and on `pagehide`, while still loaded.
   * Never called with a withheld body — `useProgressSync` just keeps
   * accumulating unreported time instead of calling this with nothing to send.
   */
  onTick(body: ProgressSyncBody): void;
  /**
   * Called exactly once, on teardown. `body` is `null` precisely when
   * `duration` was never learned before teardown (a session opened and closed
   * before the first successful load) — an open upstream session still needs
   * closing in that case, even though there is nothing yet worth syncing,
   * which is why this takes `body | null` where `onTick` never does.
   */
  onEnd(body: ProgressSyncBody | null): void;
}

/** What a loaded item needs in order to actually play — the two things a bare `PlaybackSession` doesn't answer on its own. */
export interface PlaybackSource {
  reportProgress: PlaybackProgressReporter;
  /**
   * Turns one of the loaded item's tracks into a URL `<audio>` can load, or
   * `null` when the track can't be resolved — mirrors `fileIdFromContentUrl`'s
   * own degrade-don't-throw contract. `useAudioElement` leaves `src`
   * unassigned rather than pointing it at a broken URL.
   */
  resolveTrackUrl(track: AudioTrack): string | null;
}

/**
 * Today's, and so far only, implementation. `reportProgress` is today's
 * `useProgressSync.ts` sync-then-close logic, moved here unchanged: sync
 * first, then close, because Audiobookshelf finalises the session on close
 * and the reverse order would report into an already-closed session. Both
 * calls stay fire-and-forget with a swallowed catch, exactly as before — see
 * `useProgressSync.ts`'s header for why silently going stale beats tearing
 * the player down mid-listen.
 *
 * `resolveTrackUrl` moves `fileIdFromContentUrl` + `api.audioTrackUrl` here
 * too, so `useAudioElement` no longer needs to know that Audiobookshelf
 * tracks are addressed by a `contentUrl`-derived `fileId` at all — it only
 * ever sees the resolved URL.
 */
export function audiobookshelfSource(
  api: Pick<ApiClient, 'syncSession' | 'closeSession' | 'audioTrackUrl'>,
  itemId: string,
  sessionId: string,
): PlaybackSource {
  return {
    reportProgress: {
      onTick(body) {
        void api.syncSession(sessionId, body).catch(() => undefined);
      },
      onEnd(body) {
        if (body) void api.syncSession(sessionId, body).catch(() => undefined);
        void api.closeSession(sessionId).catch(() => undefined);
      },
    },
    resolveTrackUrl(track) {
      const fileId = fileIdFromContentUrl(track.contentUrl);
      if (!fileId) return null;
      return api.audioTrackUrl(itemId, fileId);
    },
  };
}

/**
 * The honest answer for a source with no progress-reporting API wired up yet. Used directly
 * by `jellyfinSource` below, ahead of Jellyfin's own `PlaybackProgress` reporting being
 * built — exported separately so a future source (or a later wave that does wire up
 * Jellyfin progress) has a ready-made, already-tested starting point instead of writing this
 * from scratch.
 */
export const noopProgressReporter: PlaybackProgressReporter = {
  onTick() {
    // Nothing to report to — see the module header for why "doing nothing"
    // is the correct, honest behaviour here rather than a stub to fill in.
  },
  onEnd() {
    // Nothing to report to, and nothing to close.
  },
};

/**
 * Music (Phase 9 web wave). Unlike `audiobookshelfSource`, there is no session to open or
 * close — Jellyfin's stream/artwork routes are stateless proxies keyed by the track's own
 * item id (`routes/jellyfin.ts`), so this source needs no `itemId`/`sessionId` closed over
 * at construction, and `reportProgress` is the plain `noopProgressReporter`: Jellyfin has
 * its own `PlaybackProgress` API, but nothing here calls it yet, so a track played through
 * this source reports nothing upstream — an upstream "continue listening" shelf or resume
 * point will not reflect it. That gap is deliberate scope, not an oversight; see this
 * module's own header and `noopProgressReporter`'s doc comment.
 *
 * `resolveTrackUrl` reads `track.contentUrl` as the track's own Jellyfin item id directly
 * (an opaque per-source token — see `AudioTrack.contentUrl`'s doc comment in `api/types.ts`
 * — never a literal URL), which is exactly what `features/music/queue.ts`'s `albumQueue`
 * puts there.
 */
export function jellyfinSource(api: Pick<ApiClient, 'jellyfinTrackStreamUrl'>): PlaybackSource {
  return {
    reportProgress: noopProgressReporter,
    resolveTrackUrl(track) {
      const id = track.contentUrl;
      if (!id) return null;
      return api.jellyfinTrackStreamUrl(id);
    },
  };
}

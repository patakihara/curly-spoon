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
import { fileIdFromContentUrl, trackAt } from './playback.js';
import type { ProgressSyncBody } from './progressSync.js';

/**
 * Playback state alongside a tick's measured body. Kept as a second, separate
 * argument to `onTick` rather than a field on `ProgressSyncBody` because that
 * type is Audiobookshelf's own wire shape — the literal request body posted to
 * `POST /sessions/:id/sync` — which has no pause concept and must never grow one
 * it doesn't ask for; a field added there would leak into an upstream request
 * that can't use it. A named object rather than a bare boolean so a future
 * signal (e.g. playback rate) can join it without another signature change.
 */
export interface PlaybackTickState {
  isPlaying: boolean;
}

/**
 * What `useProgressSync` does with a measured stretch of listening, once
 * `progressSync.ts`'s pure `progressSyncPayload` has turned it into a body (or
 * withheld one, when `duration` isn't known yet). The hook still owns *when*
 * to call these — the 15s interval, `pagehide`, and the wall-clock
 * accumulation `progressSync.ts`'s own header describes — this interface is
 * only ever asked "given this body (or its absence) and the current play/pause
 * state, what do you do."
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
   *
   * `state` reflects play/pause at the moment of this tick, read fresh each
   * call rather than captured once — a source that cares (`jellyfinSource`)
   * needs the *current* value, not whatever it was when the reporter was
   * built. `onEnd` takes no such state: it always represents playback
   * stopping outright, never a pause, so there is nothing for it to carry.
   */
  onTick(body: ProgressSyncBody, state: PlaybackTickState): void;
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
      // `_state` is ignored deliberately: Audiobookshelf's sync endpoint has no
      // pause concept (see `PlaybackTickState`'s doc comment) and this
      // implementation's behaviour must not change at all — it reports the same
      // `body` whether the player is playing or paused, exactly as before this
      // parameter existed.
      onTick(body, _state) {
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
  onTick(_body, _state) {
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
 * item id (`routes/jellyfin.ts`).
 *
 * `resolveTrackUrl` reads `track.contentUrl` as the track's own Jellyfin item id directly
 * (an opaque per-source token — see `AudioTrack.contentUrl`'s doc comment in `api/types.ts`
 * — never a literal URL), which is exactly what `features/music/queue.ts`'s `albumQueue`
 * puts there.
 *
 * `reportProgress` now actually reports, via `POST /jellyfin/playback/{start,progress,
 * stopped}` (`@auralis/jellyfin-client`'s `reportPlaybackStart`/`reportPlaybackProgress`/
 * `reportPlaybackStopped`, proxied by the BFF — see `routes/jellyfin.ts`). The one thing
 * that makes this harder than `audiobookshelfSource` above: `ProgressSyncBody.currentTime`
 * is a position on the *queue's* cumulative timeline (`queue.ts`'s `albumQueue` lays an
 * album's tracks end to end on the same `startOffset` timeline a multi-file audiobook
 * already plays through), but Jellyfin wants a position *within the currently playing
 * track*, plus that track's own item id. `audioTracks` — the same array
 * `playerStore.load()` was given, i.e. the queue this source was constructed for — is
 * what `resolveQueuePosition` below maps a cumulative time back through, reusing
 * `playback.ts`'s `trackAt` (the same walk `useAudioElement`'s own track-boundary logic
 * already relies on) rather than re-deriving that walk here.
 *
 * Two design decisions the spec left open, made here and not elsewhere:
 *
 * 1. **Lazy, per-track start report.** Jellyfin's `ReportPlaybackStart` establishes the
 *    session's `NowPlayingItem` server-side — what its "continue listening"/resume data is
 *    built from (verified against `Emby.Server.Implementations/Session/SessionManager.cs`:
 *    `OnPlaybackStart` calls `UpdateNowPlayingItem(..., true)`, which `OnPlaybackProgress`
 *    doesn't redo when it's already been set) — but `PlaybackProgressReporter` deliberately
 *    has no `onStart` hook (see this file's header), and there is no natural "track
 *    changed" event this source is ever handed on its own. So a start report fires lazily,
 *    inside `onTick`, tracked in the `lastStartedItemId` closure below: once on the very
 *    first tick a track resolves, and again whenever the resolved item id changes from the
 *    last one reported (an album queue advancing past a track boundary). This stays inside
 *    `jellyfinSource` — the shared `PlaybackProgressReporter` interface is unchanged.
 * 2. **A `null` onEnd body sends no stop report.** `onEnd` receives `null` precisely when
 *    `duration` was never learned before teardown — a session opened and torn down before
 *    the queue's total duration was known, which also means `resolveQueuePosition` could
 *    never have resolved a track, so no item id was ever identified to report a stop
 *    *for*. Sending a stop report needs an item id; skip it rather than guess one.
 * 3. **The lazy start report still fires on a first tick that arrives while paused, and
 *    carries no pause signal of its own.** `reportPlaybackStart` has no `isPaused`
 *    parameter — Jellyfin's own client only ever sends `IsPaused: false` for it, since its
 *    job is establishing `NowPlayingItem`, not describing playback state. That would read
 *    as briefly-wrong if start were the last word, but it never is: the progress report
 *    that immediately follows it, in the same `onTick` call, always carries the real
 *    `state.isPlaying` for this tick. So a paused first tick still shows the track as
 *    `NowPlayingItem` (correct — the user has it loaded) and correctly paused (from the
 *    progress call a few lines later), with no separate handling needed here. A transition
 *    from playing to paused mid-track needs nothing beyond this either: the next
 *    already-scheduled tick reports the new state, on the existing 15s cadence — adding an
 *    immediate out-of-band report on every pause would be a second timer in disguise.
 *
 * `reportProgress`'s three network calls are fire-and-forget with a swallowed `.catch`,
 * matching `audiobookshelfSource`'s own contract above: a failed report leaves Jellyfin's
 * resume position slightly stale, never tears the player down.
 *
 * Exported — the synced-lyrics wave reuses this rather than re-deriving the same
 * cumulative-timeline-to-per-track-position walk a second time (see
 * `features/music/lyrics.ts`); the walk itself (`trackAt`) is what's actually shared,
 * this is just its Jellyfin-item-id framing of the result.
 */
export function resolveQueuePosition(
  audioTracks: AudioTrack[],
  currentTime: number,
): { itemId: string; positionSeconds: number } | null {
  const resolved = trackAt(audioTracks, currentTime);
  if (!resolved) return null;
  const itemId = resolved.track.contentUrl;
  if (!itemId) return null;
  return { itemId, positionSeconds: resolved.offsetInTrack };
}

export function jellyfinSource(
  api: Pick<
    ApiClient,
    | 'jellyfinTrackStreamUrl'
    | 'reportJellyfinPlaybackStart'
    | 'reportJellyfinPlaybackProgress'
    | 'reportJellyfinPlaybackStopped'
  >,
  audioTracks: AudioTrack[],
): PlaybackSource {
  // Closure state, not `PlaybackProgressReporter` state — see this function's doc comment,
  // decision 1. `null` until the first tick resolves a track.
  let lastStartedItemId: string | null = null;

  return {
    reportProgress: {
      onTick(body, state) {
        const resolved = resolveQueuePosition(audioTracks, body.currentTime);
        if (!resolved) return;
        if (resolved.itemId !== lastStartedItemId) {
          lastStartedItemId = resolved.itemId;
          void api
            .reportJellyfinPlaybackStart(resolved.itemId, resolved.positionSeconds)
            .catch(() => undefined);
        }
        // `isPaused` is the real fix here: without it, a paused track keeps reporting to
        // Jellyfin as playing for as long as `useProgressSync`'s interval keeps firing
        // (it fires regardless of play/pause — see that hook's own header), which leaves a
        // live Jellyfin session showing a track as actively playing indefinitely.
        void api
          .reportJellyfinPlaybackProgress(resolved.itemId, resolved.positionSeconds, {
            isPaused: !state.isPlaying,
          })
          .catch(() => undefined);
      },
      onEnd(body) {
        // See this function's doc comment, decision 2: no body means no track was ever
        // identified, so there is nothing to send a stop report *for*.
        if (!body) return;
        const resolved = resolveQueuePosition(audioTracks, body.currentTime);
        if (!resolved) return;
        void api
          .reportJellyfinPlaybackStopped(resolved.itemId, resolved.positionSeconds)
          .catch(() => undefined);
      },
    },
    resolveTrackUrl(track) {
      const id = track.contentUrl;
      if (!id) return null;
      return api.jellyfinTrackStreamUrl(id);
    },
  };
}

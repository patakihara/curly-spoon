/**
 * Pure logic for the synced lyrics view (Phase 9 web wave) — kept free of React, same
 * reasoning as `features/player/playback.ts`: unit-testable without a DOM, since this
 * repo's vitest config runs `apps/web/src/**\/*.test.ts` in the `node` environment only
 * (see `vitest.config.ts` — there is no jsdom/happy-dom or `@testing-library/react`
 * installed here, so `LyricsView.tsx` itself is deliberately kept thin and unbranching:
 * everything worth getting wrong lives here instead).
 *
 * Two independent problems:
 *
 * 1. `activeLineIndex` — given one track's lyric lines and a position *within that
 *    track*, which line is "now playing".
 * 2. `activeLyric` — the player's `currentTime` is a position on the *queue's*
 *    cumulative timeline (`features/music/queue.ts`'s `albumQueue` lays an album's
 *    tracks end to end on one `startOffset` timeline, exactly like a multi-file
 *    audiobook), but lyric timestamps are per-track. `activeLyric` maps one to the other
 *    by reusing `playbackSource.ts`'s own `resolveQueuePosition` — the identical walk
 *    `jellyfinSource`'s progress reporting already relies on to turn a queue position into
 *    "this Jellyfin item id, this far into it" — rather than re-deriving that walk a
 *    second time. Getting this wrong (using the raw queue `currentTime` directly against
 *    per-track timestamps) makes lyrics drift further out of sync the further into an
 *    album playback is; see this module's own test file for the regression this guards.
 */
import { resolveQueuePosition } from '../player/playbackSource.js';
import type { AudioTrack, JellyfinLyricLine } from '../../api/types.js';

/**
 * The index of the *active* line: the last line whose `startSeconds` is `<=` `position`.
 * Before the first timestamped line's start, no line is active (`null`) — never "the
 * first line", which would misrepresent a track's intro/instrumental lead-in as already
 * being on line one.
 *
 * Lines with a `null` `startSeconds` (unsynced) are skipped, never selected and never
 * reset the running "last one `<=` position" answer — so a hypothetical mixed-timestamp
 * response degrades to "skip the untimed lines" rather than crashing or mis-highlighting.
 * In practice this never happens: Jellyfin's two lyric parsers are mutually exclusive per
 * response (`@auralis/jellyfin-client`'s `normalizeLyrics` doc comment has the verified
 * source citation) — either every line has a timestamp or none do.
 *
 * Line order is trusted as given, not re-sorted — same reasoning and same source
 * citation as `normalizeLyrics`: the one parser that produces synced output
 * (`LrcLyricParser`) already sorts by start time server-side, and the one that produces
 * unsynced output (`TxtLyricParser`) has no timestamp to sort by, so its only meaningful
 * order is the source file's own line order, which re-sorting has no correct way to
 * preserve.
 */
export function activeLineIndex(lines: JellyfinLyricLine[], position: number): number | null {
  let active: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i]?.startSeconds;
    if (start == null) continue;
    if (start <= position) active = i;
    else break;
  }
  return active;
}

/** What's playing, in lyrics-view terms: which Jellyfin item, and which of its lines
 * (if any) is active right now. `null` when the queue position doesn't resolve to any
 * track at all (an empty queue, or a position before the first track's `startOffset` —
 * see `resolveQueuePosition`/`trackAt`). */
export interface ActiveLyric {
  itemId: string;
  lineIndex: number | null;
}

/**
 * Combines `resolveQueuePosition` (queue position -> track + in-track offset) with
 * `activeLineIndex` (in-track offset + that track's lines -> active line). `lines` must
 * already be the lyrics for whatever track `resolveQueuePosition` resolves to — this
 * function does not itself check that the two agree, because the caller
 * (`LyricsView.tsx`) only ever has one track's lyrics loaded at a time, fetched *for* the
 * resolved item id (`useJellyfinLyricsQuery(resolved?.itemId ?? null)`), so the two are
 * kept in sync by construction, not by a runtime check here.
 */
export function activeLyric(
  audioTracks: AudioTrack[],
  currentTime: number,
  lines: JellyfinLyricLine[],
): ActiveLyric | null {
  const resolved = resolveQueuePosition(audioTracks, currentTime);
  if (!resolved) return null;
  return { itemId: resolved.itemId, lineIndex: activeLineIndex(lines, resolved.positionSeconds) };
}

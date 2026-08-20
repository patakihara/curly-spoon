/**
 * Synced lyrics panel inside Now Playing (Phase 9 web wave). Deliberately thin: every
 * branch worth getting wrong (which line is active, mapping the queue's cumulative
 * `currentTime` onto a per-track position) lives in `features/music/lyrics.ts`'s pure,
 * fully-unit-tested `activeLyric`/`activeLineIndex` — this component only wires that
 * logic to `playerStore` state and renders it. That split also isn't just style: this
 * repo's vitest config (`vitest.config.ts`) only collects `apps/web/src/**\/*.test.ts` in
 * a `node` environment, and there is no jsdom/happy-dom or `@testing-library/react`
 * installed, so a `.tsx` render test for this component wouldn't run even if written —
 * keeping the logic in a plain `.ts` module is what makes it testable at all here.
 *
 * Only ever renders for a Jellyfin track (`MediaSummary.kind === 'track'`) — the same
 * flag `NowPlaying.tsx`/`playerUi.ts` already use to distinguish a synthesized Jellyfin
 * queue item from a real Audiobookshelf one (see `MediaSummary.kind`'s own doc comment
 * in `api/types.ts`). A book or podcast episode fires no lyrics request at all and shows
 * no lyrics affordance.
 */
import { useEffect, useRef, useState } from 'react';
import { Skeleton, prefersReducedMotion, watchReducedMotion } from '@auralis/ui';
import { useJellyfinLyricsQuery } from '../../api/queries.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { activeLyric } from '../music/lyrics.js';
import { resolveQueuePosition } from './playbackSource.js';

export function LyricsView() {
  const currentItem = usePlayerStore((s) => s.currentItem);
  const tracks = usePlayerStore((s) => s.tracks);
  const currentTime = usePlayerStore((s) => s.currentTime);

  const isJellyfinTrack = currentItem?.media.kind === 'track';
  // Reuses the same queue-walk `jellyfinSource`'s own progress reporting relies on
  // (`playbackSource.ts`'s `resolveQueuePosition`) rather than a second one — see
  // `lyrics.ts`'s module doc comment for why a second walk here would be the wrong move.
  const resolved = isJellyfinTrack ? resolveQueuePosition(tracks, currentTime) : null;

  const lyricsQuery = useJellyfinLyricsQuery(resolved?.itemId ?? null);

  // Drives smooth-vs-instant scroll from the OS reduced-motion preference directly,
  // rather than a library prop — this project has twice shipped motion that ignored it
  // (see docs/HANDOVER.md's Mantine section: `Modal`'s `unstyled` overlay and
  // `Skeleton`'s shimmer were both bitten by trusting a library default here instead).
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  useEffect(() => watchReducedMotion(setReducedMotion), []);

  const activeLineRef = useRef<HTMLLIElement | null>(null);

  const lyrics = lyricsQuery.data?.lyrics ?? null;
  const active =
    resolved && lyrics && lyrics.synced ? activeLyric(tracks, currentTime, lyrics.lines) : null;
  const activeIndex = active?.lineIndex ?? null;

  useEffect(() => {
    if (activeIndex == null) return;
    activeLineRef.current?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [activeIndex, reducedMotion]);

  if (!isJellyfinTrack || !resolved) return null;

  if (lyricsQuery.isLoading) {
    return (
      <div className="auralis-lyrics" data-testid="lyrics-view">
        <Skeleton shape="rectangular" width="100%" height={20} />
        <Skeleton shape="rectangular" width="80%" height={20} />
        <Skeleton shape="rectangular" width="90%" height={20} />
      </div>
    );
  }

  if (lyricsQuery.isError) {
    return (
      <p className="auralis-lyrics auralis-lyrics--message" role="alert" data-testid="lyrics-view">
        Couldn't load lyrics.
      </p>
    );
  }

  if (!lyrics || lyrics.lines.length === 0) {
    // The common case for most of a library — Jellyfin having no lyrics for a track is
    // not an error, so this is plain text, not `role="alert"`.
    return (
      <p className="auralis-lyrics auralis-lyrics--message" data-testid="lyrics-view">
        No lyrics for this track.
      </p>
    );
  }

  return (
    // No `aria-live`: the active line changes every few seconds while a track plays,
    // and a live region would re-announce a new line to a screen reader on every change
    // — exactly the "spam" this component must not produce. Lyrics are readable as
    // ordinary static text; a listener using a screen reader can read through them at
    // their own pace the same way a sighted listener reads ahead on screen, rather than
    // being interrupted by an announcement every few seconds.
    <ul className="auralis-lyrics" data-testid="lyrics-view">
      {lyrics.lines.map((line, index) => {
        // Wave 16e-nowplaying (docs/design/screens/NOW_PLAYING.md §3.5/§6.5): Sonora's
        // three-way split — active / already passed / not yet reached — keyed to `index`
        // against `activeIndex`. The active-line logic itself is unchanged (`lyrics.ts`'s
        // `activeLyric`); only this render-side mapping to a style role is new. Unsynced
        // lyrics (`lyrics.synced === false`) keep every line in the base "not yet
        // reached" role — both `isActive` and `isPassed` are gated on `lyrics.synced`, so
        // neither ever fires, matching the existing `synced` gate unchanged.
        const isActive = lyrics.synced && index === activeIndex;
        const isPassed = lyrics.synced && activeIndex != null && index < activeIndex;
        const lineClassName = isActive
          ? 'auralis-lyrics__line auralis-lyrics__line--active'
          : isPassed
            ? 'auralis-lyrics__line auralis-lyrics__line--passed'
            : 'auralis-lyrics__line';
        return (
          <li
            key={index}
            ref={isActive ? activeLineRef : undefined}
            className={lineClassName}
            data-testid={`lyrics-line-${index}`}
          >
            {line.text}
          </li>
        );
      })}
    </ul>
  );
}

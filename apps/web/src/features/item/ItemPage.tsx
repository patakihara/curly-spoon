/**
 * Item detail — metadata plus the entry point into playback. Starting playback
 * needs a session (`POST /items/:id/play`), not just the item metadata already
 * on this page, because only the session carries tracks/chapters/the resume
 * point; the item alone is display chrome (see `playerStore.ts`'s header).
 *
 * Restyled against Sonora's `MediaHeader` (`docs/design/screens/BOOK_DETAIL.md` §3,
 * `docs/design/sonora/components/MediaHeader.dc.html`) plus two new behaviours the
 * spec introduces: chapter tap-to-play-and-seek, and a real author link.
 *
 * **Progress is folded into the composed meta line** (`itemMeta.ts`), not shown as a
 * separate bar — Sonora's own `book` mock has no progress-bar element, only
 * `"… · 38% listened"` in the header's one muted meta line. This drops the old
 * `LinearProgress`; nothing in `e2e/` referenced its testid or aria-label.
 *
 * **Chapter tap has two cases** (spec §5): if this book isn't the player's
 * currently-loaded item, tapping a chapter starts playback of *this* book and then
 * seeks to that chapter — new behaviour, since `ChapterList.tsx` (Now Playing) only
 * ever operates on an already-loaded session. If this book *is* already loaded,
 * tapping seeks within the existing session, exactly like `ChapterList.tsx` does.
 * Active-chapter highlighting only ever applies in the second case — a stored
 * `progress` point is not a chapter-boundary-aligned "currently playing" position.
 *
 * **The author link reads `item.media.authors[].id` through `useItemDetailQuery`**,
 * a screen-scoped view of this same `GET /items/:id?expanded=true` response typed to
 * see the real author id (`ItemDetailAuthorRef` in `api/types.ts`) that the shared
 * `LibraryItem`/`AuthorBadge` shape deliberately hides everywhere else in the app —
 * see that type's doc comment for why widening `AuthorBadge` itself would be wrong.
 */
import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Button, ListItem } from '@auralis/ui';
import { RichDescription } from '../../components/RichDescription.js';
import { CoverImage } from '../../components/CoverImage.js';
import { useApi } from '../../api/ApiContext.js';
import { useItemDetailQuery, usePlayItemMutation } from '../../api/queries.js';
import { ApiError } from '../../api/errors.js';
import { audiobookshelfSource } from '../player/playbackSource.js';
import { usePlayerStore } from '../../state/playerStore.js';
import { useBreakpoint } from '../../hooks/useBreakpoint.js';
import { chapterAt, formatDuration } from '../player/playback.js';
import { composeItemMeta } from './itemMeta.js';
import type { Chapter } from '../../api/types.js';

export function ItemPage() {
  const { itemId } = useParams({ from: '/item/$itemId' });
  const api = useApi();
  const itemQuery = useItemDetailQuery(itemId);
  const playMutation = usePlayItemMutation();
  const [playError, setPlayError] = useState<string | null>(null);
  const isCompact = useBreakpoint() === 'compact';

  // Reactive: whether *this* book is the player's currently-loaded item, and
  // where playback currently is — both drive chapter-tap behaviour and
  // active-chapter highlighting below (spec §5).
  const currentItemId = usePlayerStore((s) => s.currentItem?.id ?? null);
  const currentTime = usePlayerStore((s) => s.currentTime);

  if (itemQuery.isLoading) {
    return (
      <div className="auralis-page" data-testid="item-page">
        <p>Loading…</p>
      </div>
    );
  }

  // Unlike list pages (which degrade to an inline message so the rest of the
  // page stays usable), a detail page with no data has nothing else useful to
  // show — throwing hands it to this route's `errorComponent`
  // (`RouteErrorBoundary`), the real "something broke, try again" surface
  // rather than a bare inline message.
  if (itemQuery.isError) throw itemQuery.error;

  const item = itemQuery.data?.item;
  if (!item) return null;

  const isLoaded = currentItemId === item.id;
  const chapters = item.media.chapters ?? [];
  const activeChapter = isLoaded ? chapterAt(chapters, currentTime) : undefined;

  /** Starts playback of this book; when `seekTo` is given, seeks there right after
   *  loading — the "tap a chapter of a not-yet-playing book" case. */
  const startPlayback = async (seekTo?: number) => {
    setPlayError(null);
    try {
      const { session } = await playMutation.mutateAsync(item.id);
      usePlayerStore.getState().load(item, session, audiobookshelfSource(api, item.id, session.id));
      usePlayerStore.getState().play();
      if (seekTo !== undefined) usePlayerStore.getState().seek(seekTo);
    } catch (err) {
      const apiError =
        err instanceof ApiError ? err : new ApiError('unknown_error', String(err), 0);
      setPlayError(
        apiError.isNetworkError
          ? "Couldn't reach the Auralis server. Try again."
          : apiError.message || 'Could not start playback.',
      );
    }
  };

  const handlePlay = () => void startPlayback();

  const handleChapterTap = (chapter: Chapter) => {
    if (isLoaded) {
      usePlayerStore.getState().seek(chapter.start);
    } else {
      void startPlayback(chapter.start);
    }
  };

  const authors = item.media.authors ?? [];
  const authorNames = authors.map((a) => a.name).join(', ');
  const primaryAuthorId = authors[0]?.id;

  const meta = composeItemMeta({
    narrator: item.media.narrator,
    durationSeconds: item.media.duration,
    chapterCount: chapters.length,
    progressPercent: item.progress ? Math.round(item.progress.progress * 100) : null,
  });

  return (
    <div className="auralis-page" data-testid="item-page">
      <div
        className={
          isCompact ? 'auralis-item-header auralis-item-header--compact' : 'auralis-item-header'
        }
      >
        <CoverImage
          src={api.coverUrl(item.id, { width: 400 })}
          alt=""
          size={isCompact ? 208 : 232}
          fallbackIcon="book_2"
          style={{
            borderRadius: 'var(--radius-lg)',
            // Tonal letterbox behind a cover that is loading, or narrower than
            // its frame — `CoverImage` supplies the radius and object-fit but
            // has no opinion about what sits behind the image.
            background: 'var(--surface-card)',
          }}
        />
        <div className="auralis-item-header__meta">
          <span className="auralis-item-header__kind">Audiobook</span>
          <h1 className="auralis-item-header__title">{item.media.title}</h1>
          {item.media.subtitle ? (
            <p className="auralis-item-header__byline">{item.media.subtitle}</p>
          ) : null}
          {authorNames ? (
            primaryAuthorId ? (
              <Link
                to="/author/$authorId"
                params={{ authorId: primaryAuthorId }}
                className="auralis-item-header__subtitle auralis-item-header__subtitle--link"
                data-testid="item-author-link"
              >
                {authorNames}
              </Link>
            ) : (
              <p className="auralis-item-header__subtitle">{authorNames}</p>
            )
          ) : null}
          {meta ? <p className="auralis-item-header__meta-line">{meta}</p> : null}
          <div className="auralis-item-header__actions">
            <Button data-testid="item-play" loading={playMutation.isPending} onClick={handlePlay}>
              {item.progress ? 'Resume' : 'Play'}
            </Button>
          </div>
          {playError ? (
            <p role="alert" data-testid="item-play-error">
              {playError}
            </p>
          ) : null}
        </div>
      </div>

      <RichDescription
        html={item.media.description}
        className="auralis-item-description"
        data-testid="item-description"
      />

      {chapters.length > 0 ? (
        <section className="auralis-item-chapters">
          <h2 className="auralis-item-chapters__heading">Chapters</h2>
          <ul className="auralis-item-chapters__list" data-testid="item-chapters">
            {chapters.map((chapter, index) => (
              <li key={chapter.id} className="auralis-item-chapters__row">
                <ListItem
                  data-testid={`item-chapter-${chapter.id}`}
                  leading={<span aria-hidden="true">{index + 1}</span>}
                  headline={chapter.title}
                  supportingText={formatDuration(chapter.start)}
                  selected={activeChapter?.id === chapter.id}
                  onClick={() => handleChapterTap(chapter)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Shared detail-screen header — cover art, kind label, title, an optional byline/subtitle,
 * a composed meta line, and an actions slot. Extracted from `ItemPage.tsx`'s Sonora restyle
 * (16e-book-W, `docs/design/screens/BOOK_DETAIL.md` §3) so `PodcastDetailPage.tsx`
 * (16e-podcast-W, `docs/design/screens/PODCAST_DETAIL.md` §9) doesn't grow a second copy of
 * the same block — the same relationship Android's `MediaHeader.kt` already has to
 * `BookDetailScreen`/`PodcastDetailScreen`/`AlbumDetailScreen` (`16e-book-A-2`). This
 * component's prop shape is modelled after that Kotlin composable's settled one
 * (`coverUrl`, `fallbackIcon`, `kindLabel`, `title`, `subtitle`, `meta`, an `actions` slot) —
 * it is already proven to serve three call sites there.
 *
 * **Location: `apps/web/src/components/`, not `packages/ui`** — this directory already
 * holds app-specific, non-generic pieces of exactly this shape (`CoverImage`,
 * `RichDescription`). `packages/ui` membership would pull this into that package's barrel
 * export, which this repo's own `sideEffects`/entry-chunk history (`HANDOVER.md` §14a) shows
 * has real weight and CSS-delivery-timing consequences, plus it would need a gallery entry
 * and `e2e/ui` coverage neither call site needs.
 *
 * **Reuses `ItemPage.tsx`'s original `.auralis-item-header*` class names verbatim**, not
 * renamed ones — they were already generic (not book-specific), and `app.css`'s rules for
 * them are unchanged by this extraction, so `styles/layoutOverflow.test.ts`'s
 * selector-based assertions on `.auralis-item-header`/`.auralis-item-header__meta` keep
 * passing with no edit to `app.css`.
 *
 * **`subtitle` is `ReactNode`, not a plain string** — mirrors `MediaHeader.kt`'s
 * `subtitle: String?` plus this app's own plain-vs-link split: the book screen's author
 * subtitle is sometimes a real, linkable id (`ItemPage.tsx`'s `/author/$authorId` link);
 * podcasts never have one (`PODCAST_DETAIL.md` §8 — a publisher is a flat string, not a
 * linkable entity in this app's data model). This component has no opinion about routing,
 * so the caller builds the link itself and applies the two exported class-name constants
 * below so both call sites keep rendering the identical CSS, whether the actual element is
 * a `<p>` or a router `<Link>`.
 *
 * **`byline` is a second, book-only text slot** (`item.media.subtitle`, e.g. "A Dune
 * Novel") — distinct from `subtitle` (the author/publisher line) to avoid the naming
 * collision with Android's `subtitle` prop, which means *author*. Podcasts have no
 * equivalent field and simply never pass it.
 *
 * **The art tile's radius/background are baked in here, not left to each caller's `style`
 * prop** — both current call sites want the identical `var(--radius-lg)`/`var(--surface-card)`
 * pairing (`BOOK_DETAIL.md`/`PODCAST_DETAIL.md` §3's geometry table), so leaving it
 * caller-supplied would just be two copies of the same two lines.
 *
 * **`actions` renders inside `.auralis-item-header__actions`; `footer` renders after it,
 * unwrapped** — mirrors `ItemPage.tsx`'s original layout, where a play-error `<p role="alert">`
 * sat as a sibling *after* the actions row, both still inside `.auralis-item-header__meta`.
 */
import type { ReactNode } from 'react';
import type { IconName } from '@auralis/ui';
import { CoverImage } from './CoverImage.js';
import { useBreakpoint } from '../hooks/useBreakpoint.js';

/** Applied to a plain-text subtitle. A linkable subtitle applies both this and
 * `MEDIA_HEADER_SUBTITLE_LINK_CLASS`, exactly as `ItemPage.tsx`'s author link already did
 * before this extraction. */
export const MEDIA_HEADER_SUBTITLE_CLASS = 'auralis-item-header__subtitle';
export const MEDIA_HEADER_SUBTITLE_LINK_CLASS = 'auralis-item-header__subtitle--link';

export interface MediaHeaderProps {
  /** Cover art URL — `CoverImage` degrades to a tonal fallback tile on load failure. */
  coverSrc: string;
  fallbackIcon: IconName;
  /** Small-caps, muted kind label (SONORA.md §3.5) — e.g. `"Audiobook"`, `"Podcast"`. */
  kindLabel: string;
  title: string;
  /** The item's own subtitle field (books only, e.g. "A Dune Novel") — rendered above
   * `subtitle`, plain text, no link. Omitted entirely (no empty row) when absent. */
  byline?: string | null;
  /** Author/publisher line — plain text or a pre-built link element; see this module's
   * doc comment for why the caller builds the link itself. Omitted entirely when absent. */
  subtitle?: ReactNode;
  /** The composed meta line (`itemMeta.ts`/a screen's own meta composer) — already joined
   * and fallback-guarded by the caller; renders nothing when `null`/`undefined`/empty. */
  meta?: string | null;
  /** Rendered inside `.auralis-item-header__actions` — e.g. a Play/Resume button. */
  actions?: ReactNode;
  /** Rendered after the actions row, unwrapped — e.g. a play-error `role="alert"` message. */
  footer?: ReactNode;
}

export function MediaHeader({
  coverSrc,
  fallbackIcon,
  kindLabel,
  title,
  byline,
  subtitle,
  meta,
  actions,
  footer,
}: MediaHeaderProps) {
  const isCompact = useBreakpoint() === 'compact';

  return (
    <div
      className={
        isCompact ? 'auralis-item-header auralis-item-header--compact' : 'auralis-item-header'
      }
    >
      <CoverImage
        src={coverSrc}
        alt=""
        size={isCompact ? 208 : 232}
        fallbackIcon={fallbackIcon}
        style={{
          borderRadius: 'var(--radius-lg)',
          // Tonal letterbox behind a cover that is loading, or narrower than its
          // frame — `CoverImage` supplies the radius and object-fit but has no
          // opinion about what sits behind the image.
          background: 'var(--surface-card)',
        }}
      />
      <div className="auralis-item-header__meta">
        <span className="auralis-item-header__kind">{kindLabel}</span>
        <h1 className="auralis-item-header__title">{title}</h1>
        {byline ? <p className="auralis-item-header__byline">{byline}</p> : null}
        {subtitle}
        {meta ? <p className="auralis-item-header__meta-line">{meta}</p> : null}
        {actions ? <div className="auralis-item-header__actions">{actions}</div> : null}
        {footer}
      </div>
    </div>
  );
}

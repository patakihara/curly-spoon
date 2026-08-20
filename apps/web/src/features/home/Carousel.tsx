/**
 * One horizontally-scrolling row of uniform cards (docs/ROADMAP.md §12d).
 * The single component every For You carousel renders through, regardless of
 * content type — the requirement this wave exists to satisfy is "one card
 * geometry, one carousel pattern, repeated", and the reference screenshots'
 * own anti-pattern (`04-for-you.jpg`: a 4-column icon grid for shows, then
 * full-width episode cards) is exactly what having a second component here
 * would risk drifting into.
 *
 * Every card is a fixed `cardWidth`x`coverSize` box regardless of the source
 * artwork's aspect ratio — `CoverImage`'s `object-fit: cover` crops rather
 * than pads, but the box itself never varies, which is what the "all cards
 * the same size" requirement is actually about; true letterboxing (padding
 * to preserve the whole image) would need a second visual treatment this app
 * has nowhere else, and isn't what any of the four reference screenshots
 * show either — every card in them is a cropped square.
 *
 * Wave 16e-foryou-W (`docs/design/screens/FOR_YOU.md` §3.1): card geometry is now a
 * genuine desktop/compact split (176px/152px card width, `--radius-md`/`--radius-sm`
 * art radius, `--surface-*` desktop colors vs. `--m3-*` compact colors — Sonora's own
 * `MediaCard` source keeps the compact/mobile column on `--m3-*` deliberately, so this
 * is not an incomplete migration) rather than the single fixed size this component
 * rendered at every width before. `useBreakpoint() === 'compact'` is the same test
 * `MediaHeader.tsx` already uses for its own desktop/compact split.
 *
 * Deliberately no CSS `scroll-behavior: smooth` (or any other scroll
 * animation) on the track: the only motion a user could see here is the
 * browser's own native, instant scroll response to wheel/touch/keyboard
 * input, so there is nothing that needs to check `prefers-reduced-motion` —
 * unlike `Skeleton`'s shimmer, there is no `@keyframes` to disarm.
 *
 * `role="list"` + `tabIndex={0}` on the scroll track: a real list for
 * assistive tech, and a focusable scroll container so a keyboard user can
 * reach it and scroll it (every modern browser scrolls a focused, overflowing
 * element on arrow-key input with no extra wiring needed).
 */
import type { CSSProperties } from 'react';
import { LinearProgress, Skeleton } from '@auralis/ui';
import { isExternalItem } from '../../api/availability.js';
import { CoverImage } from '../../components/CoverImage.js';
import { useBreakpoint } from '../../hooks/useBreakpoint.js';
import type { FeedItem } from './forYouFeed.js';

const CARD_WIDTH_DESKTOP = 176;
const CARD_WIDTH_COMPACT = 152;
/** Art is square (1:1) and fills the card's full width — no separate "cover size"
 * distinct from card width, matching the pre-Sonora convention this file already used. */
const ART_RADIUS_DESKTOP = 'var(--radius-md)'; // 24px
const ART_RADIUS_COMPACT = 'var(--radius-sm)'; // 16px

function cardWidthFor(isCompact: boolean): number {
  return isCompact ? CARD_WIDTH_COMPACT : CARD_WIDTH_DESKTOP;
}

function artRadiusFor(isCompact: boolean): string {
  return isCompact ? ART_RADIUS_COMPACT : ART_RADIUS_DESKTOP;
}

/** FOR_YOU.md §3.1's Title/Subtitle rows: desktop reads `--surface-*`, compact/mobile
 * deliberately stays on `--m3-*` — this is Sonora's own `MediaCard` source doing this,
 * not an unmigrated leftover (see the doc comment on `ART_RADIUS_COMPACT` for the same
 * pattern elsewhere on this card). Shared by the subtitle, the external-item title
 * override and the external pill's text, all of which the table calls "muted". */
function mutedTextColorFor(isCompact: boolean): string {
  return isCompact ? 'var(--m3-on-surface-variant)' : 'var(--surface-fg-muted)';
}

function fullTextColorFor(isCompact: boolean): string {
  return isCompact ? 'var(--m3-on-background)' : 'var(--surface-fg)';
}

const TRACK_STYLE: CSSProperties = {
  display: 'flex',
  gap: 16,
  overflowX: 'auto',
  paddingBottom: 8,
};

const TILE_WRAPPER_STYLE: CSSProperties = {
  flex: '0 0 auto',
};

/** Positions the external badge over the cover art — see `externalBadgeStyleFor`'s doc
 * comment. `CoverImage` itself takes no `position` prop, so this wraps it rather than
 * reaching in. */
const COVER_WRAPPER_STYLE: CSSProperties = {
  position: 'relative',
};

/**
 * Wave 15d-1-W: the "not in your library" pill an external (ListenBrainz-derived) card
 * carries, so a user can tell at a glance this is something to *discover*, not something
 * she already owns — `docs/design/sonora/components/MediaCard.dc.html`'s `absentPillStyle`
 * is the design source. Wave 16e-foryou-W: onto Sonora's own tokens now that
 * `docs/design/screens/FOR_YOU.md` §3.1 gives the exact values — `--radius-pill`,
 * `--text-xs`, background `--surface-bg` (unconditional, both breakpoints — the table's
 * compact column says "same"), text color the same muted role the title/subtitle use at
 * this breakpoint. `aria-hidden` because the accessible name for the whole card already
 * carries this via `cardLabel` below — a screen reader user must not hear it twice.
 */
function externalBadgeStyleFor(isCompact: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: 8,
    top: 8,
    padding: '3px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 'var(--text-xs)',
    fontWeight: 700,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    background: 'var(--surface-bg)',
    color: mutedTextColorFor(isCompact),
  };
}

function tileStyleFor(isCompact: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    width: cardWidthFor(isCompact),
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
  };
}

/**
 * `height` is fixed rather than left to the text's own line box deliberately: a
 * real title and a `Skeleton shape="text"` placeholder don't necessarily agree on
 * line height (the skeleton defaults to `1em` — see `Skeleton.tsx` — a real line box
 * is usually taller), and this row has to be the same height either way for the
 * "no layout jump" and "every card the same size" requirements to hold exactly,
 * not approximately. Wave 16e-foryou-W: `margin-top: 10px` and `--text-md`/`--surface-*`
 * or `--m3-*` color per FOR_YOU.md §3.1's Title row — font-size (14px) is unchanged from
 * before, only now expressed as the token rather than a literal.
 */
function titleStyleFor(isCompact: boolean): CSSProperties {
  return {
    margin: '10px 0 0',
    height: 18,
    fontSize: 'var(--text-md)',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: fullTextColorFor(isCompact),
  };
}

/** The recommendation reason ("Because you finished Dune") sits directly under the
 * section heading, smaller and muted — visually subordinate to the title, the same
 * treatment `subtitleStyleFor` gives a card's byline under its title. Unlike the fixed-
 * height rows below (title/subtitle/progress), this has no "every card is the same
 * size" constraint to satisfy — it renders once per section, not once per card — so it
 * wraps naturally instead of being clipped to one line. FOR_YOU.md §3.1 has no row for
 * this element (it's outside `MediaCard` itself), so it keeps reading the same muted
 * role the subtitle uses at this breakpoint rather than a value the spec never gives. */
function reasonStyleFor(isCompact: boolean): CSSProperties {
  return {
    margin: '0 0 8px',
    fontSize: 'var(--text-sm)',
    color: mutedTextColorFor(isCompact),
  };
}

/** See `titleStyleFor`'s doc comment — same fixed-height reasoning. Wave 16e-foryou-W:
 * `margin-top: 2px` per FOR_YOU.md §3.1's Subtitle row (previously no margin at all). */
function subtitleStyleFor(isCompact: boolean): CSSProperties {
  return {
    margin: '2px 0 0',
    height: 16,
    fontSize: 'var(--text-sm)',
    color: mutedTextColorFor(isCompact),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };
}

/**
 * A fixed-height row for the progress bar, always rendered — whether or not this
 * item actually has a `progress` value. Without it, a book mid-listen (which gets
 * a `LinearProgress`) would stand visibly taller than an album or a not-yet-started
 * podcast (which wouldn't), which is exactly the "same card size" requirement this
 * whole component exists to satisfy. `LinearProgress`'s own rendered bar is 4px
 * (`size={4}`, `LinearProgress.tsx`) — this row is sized to match with no visible
 * empty gap.
 *
 * FOR_YOU.md §3.1 describes a different treatment for this element (a 5px bar
 * overlaid on the bottom of the cover art, not a row below the title/subtitle) — that
 * row is recon, not contract (the document's own header: "§3.1 ... [is] recon —
 * evidence gathered to justify the contract, not requirements in their own right"),
 * and §9's binding work list for this file names card width, art radius, title/
 * subtitle colors and the label text fix as the four things to change here — it does
 * not name a progress-bar repositioning. Left as today's below-content row rather than
 * guessed at; flagged in this wave's report as a spec ambiguity, not silently resolved
 * either way.
 */
const PROGRESS_ROW_STYLE: CSSProperties = {
  height: 4,
  display: 'flex',
  alignItems: 'center',
};

export interface CarouselProps {
  /**
   * Used to build stable `data-testid`s — the shelf/carousel id, unique across the
   * page. Every testid this component renders keeps the pre-12d `shelf-`/
   * `shelf-item-` convention (`shelf-${id}` for the section, `shelf-item-${item.id}`
   * for each card) rather than a new `carousel-`/`feed-card-` one: a wide set of
   * existing specs (`onboarding.spec.ts`, `browse.spec.ts`, `contrast.spec.ts`,
   * `player.spec.ts`, `music-queue.spec.ts`, `queue-view.spec.ts`,
   * `tablet-breakpoint.spec.ts`, `lyrics.spec.ts`) already click or assert on those
   * exact ids, and none of them are this wave's to rewrite.
   */
  id: string;
  label: string;
  items: FeedItem[];
  /** Why this carousel was chosen, e.g. "Because you finished Dune" — present only
   * on recommended carousels (`FeedCarousel.reason`, `docs/ROADMAP.md` §13). Renders
   * as a subordinate line under the heading; absent entirely for an ordinary
   * Audiobookshelf/Jellyfin shelf, which has no `<p>` where this would go. */
  reason?: string;
  /** While true, renders `skeletonCount` placeholder cards — same box size as a
   * loaded card — instead of `items`. */
  loading?: boolean;
  skeletonCount?: number;
  onSelect: (item: FeedItem) => void;
}

/** An accessible name for a card: title alone, or "title, subtitle" when there is one —
 * `aria-label` rather than relying on the rendered text nodes, since the cover image
 * itself has no accessible name (`alt=""`, deliberately — it's decorative next to the
 * visible title). Exported for `Carousel.test.tsx` — this repo has no `jsdom`/
 * `@testing-library/react` installed (see `ChapterList.test.tsx`'s header), so a
 * component's testable behaviour is whatever pure logic it delegates to, not a render. */
export function cardLabel(item: FeedItem): string {
  const base = item.subtitle ? `${item.title}, ${item.subtitle}` : item.title;
  // Wave 15d-1-W: announced, not just drawn — an external card's visual pill is
  // `aria-hidden`, so this is the only place a screen reader user learns the item
  // isn't in her library.
  //
  // Wave 16e-foryou-W, FOR_YOU.md §6.3: the suffix text changes from "not in your
  // library" to "not in library" — Sonora's own literal string, and the canonical
  // one across a real three-way mismatch this session found (web's badge already said
  // "Not in library"; web's aria-label and Android's constant both said "Not in your
  // library"). Byte-for-byte parity target with Android's `EXTERNAL_RECOMMENDATION_LABEL`.
  return isExternalItem(item) ? `${base}, not in library` : base;
}

export function Carousel({
  id,
  label,
  items,
  reason,
  loading = false,
  skeletonCount = 4,
  onSelect,
}: CarouselProps) {
  const isCompact = useBreakpoint() === 'compact';

  // Nothing to show and nothing loading: rendering an empty, headed section would be a
  // carousel with no cards in it, which is worse than not rendering the section at all.
  if (!loading && items.length === 0) return null;

  const headingId = `shelf-heading-${id}`;
  const reasonId = `shelf-reason-${id}`;
  const tileStyle = tileStyleFor(isCompact);
  const titleStyle = titleStyleFor(isCompact);
  const subtitleStyle = subtitleStyleFor(isCompact);
  const externalBadgeStyle = externalBadgeStyleFor(isCompact);
  const coverSize = cardWidthFor(isCompact);
  const artRadius = artRadiusFor(isCompact);

  return (
    <section data-testid={`shelf-${id}`}>
      <h2 id={headingId} style={{ margin: reason ? '0 0 2px' : '0 0 8px' }}>
        {label}
      </h2>
      {/* Reading order matters more than styling here: this sits in the DOM
          immediately after the heading and before the card list, so a screen
          reader announces title, then reason, then cards — the same order a
          sighted user reads top-to-bottom. `aria-describedby` on the list below
          makes that relationship explicit rather than merely positional. */}
      {reason ? (
        <p id={reasonId} style={reasonStyleFor(isCompact)} data-testid={`shelf-reason-${id}`}>
          {reason}
        </p>
      ) : null}
      <div
        role="list"
        aria-labelledby={headingId}
        aria-describedby={reason ? reasonId : undefined}
        tabIndex={0}
        style={TRACK_STYLE}
        data-testid={`shelf-track-${id}`}
      >
        {loading
          ? Array.from({ length: skeletonCount }, (_, i) => (
              <div role="listitem" key={i} style={TILE_WRAPPER_STYLE}>
                <div style={tileStyle} data-testid={`shelf-item-skeleton-${id}-${i}`}>
                  {/* `Skeleton`'s `SkeletonProps` deliberately omits `style` (Mantine's own
                      fixed `radius="md"` token is used for every skeleton in the app), so
                      the art radius token only reaches the real, loaded cover below — the
                      skeleton's box *size* still matches exactly, which is what the "same
                      box as a loaded card" invariant actually requires. */}
                  <Skeleton shape="rectangular" width={coverSize} height={coverSize} />
                  {/* Same three rows a loaded card always renders (title, subtitle,
                      progress), so the skeleton's total box height matches exactly —
                      the "no layout jump" requirement this pins down. */}
                  <div style={titleStyle}>
                    <Skeleton shape="text" width="80%" />
                  </div>
                  <div style={subtitleStyle}>
                    <Skeleton shape="text" width="55%" />
                  </div>
                  <div style={PROGRESS_ROW_STYLE} />
                </div>
              </div>
            ))
          : items.map((item) => {
              const external = isExternalItem(item);
              return (
                <div role="listitem" key={item.id} style={TILE_WRAPPER_STYLE}>
                  <button
                    type="button"
                    style={tileStyle}
                    data-testid={`shelf-item-${item.id}`}
                    aria-label={cardLabel(item)}
                    onClick={() => onSelect(item)}
                  >
                    <div style={COVER_WRAPPER_STYLE}>
                      <CoverImage
                        src={item.coverSrc}
                        size={coverSize}
                        fallbackIcon={item.fallbackIcon}
                        style={{ borderRadius: artRadius }}
                      />
                      {external ? (
                        <span
                          style={externalBadgeStyle}
                          aria-hidden="true"
                          data-testid={`shelf-item-${item.id}-external-badge`}
                        >
                          Not in library
                        </span>
                      ) : null}
                    </div>
                    <h3
                      style={{
                        ...titleStyle,
                        color: external ? mutedTextColorFor(isCompact) : titleStyle.color,
                      }}
                      aria-hidden="true"
                    >
                      {item.title}
                    </h3>
                    {/* Always rendered, even with nothing to show — see subtitleStyleFor's
                      sibling comment on PROGRESS_ROW_STYLE: an item with no subtitle
                      must not end up shorter than one that has one. */}
                    <p style={subtitleStyle} aria-hidden="true">
                      {item.subtitle ?? ' '}
                    </p>
                    <div style={PROGRESS_ROW_STYLE}>
                      {item.progress != null ? (
                        <LinearProgress
                          value={item.progress}
                          aria-label={`${Math.round(item.progress * 100)}% complete`}
                        />
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })}
      </div>
    </section>
  );
}

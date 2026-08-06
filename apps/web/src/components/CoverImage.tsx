/**
 * A square cover image with a tonal-icon fallback for artwork that 404s or
 * otherwise fails to load. Home's `ShelfCard` (`features/home/HomePage.tsx`)
 * already implements this `onError`/state-toggle pattern; Music's Jellyfin
 * artist/album cards used a bare `<img>` instead and fell through to the
 * browser's native broken-image glyph (web design audit, 2026-08-06). Rather
 * than write a second copy of the pattern, Music's six call sites all use
 * this one. Home is left as-is: its cover box is a full-width, aspect-ratio
 * tile with its own sizing rules, genuinely different from the fixed-pixel
 * square Music uses, and there is no rendering test in this repo (see below)
 * to catch a visual regression if the two were forced onto one shape.
 *
 * `api.jellyfinArtworkUrl`/`api.coverUrl` both build a URL from an id alone
 * with no way to know up front whether the artwork actually exists, so
 * `onError` is the only signal that it doesn't.
 *
 * The fallback markup is exported separately as `CoverImageFallback` so it
 * can be exercised directly in a unit test: this repo's `vitest.config.ts`
 * runs under `environment: 'node'` (no jsdom/happy-dom installed — see
 * `hooks/breakpoint.test.ts`'s doc comment), so the `onError` event itself
 * can't be simulated here. `CoverImageFallback`'s markup can still be
 * rendered via `react-dom/server` and asserted on directly.
 */
import { useState, type CSSProperties } from 'react';
import { Icon, MantineImage, type IconName } from '@auralis/ui';

export interface CoverImageProps {
  src: string;
  alt?: string;
  /** Square side length, in CSS px. */
  size: number;
  /** Glyph shown in the tonal fallback when the image fails to load. */
  fallbackIcon: IconName;
  style?: CSSProperties;
}

const BORDER_RADIUS = 8;

function fallbackStyle(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: BORDER_RADIUS,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--m3-surface-container-highest)',
    color: 'var(--m3-on-surface-variant)',
  };
}

/** The tonal placeholder alone, with no load-state logic — same colours and
 * centring as Home's `ShelfCard` fallback. */
export function CoverImageFallback({ size, icon }: { size: number; icon: IconName }) {
  return (
    <div style={fallbackStyle(size)} aria-hidden="true">
      <Icon name={icon} size={Math.round(size / 3)} />
    </div>
  );
}

export function CoverImage({ src, alt = '', size, fallbackIcon, style }: CoverImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return <CoverImageFallback size={size} icon={fallbackIcon} />;

  return (
    <MantineImage
      src={src}
      alt={alt}
      width={size}
      height={size}
      fit="cover"
      style={{ borderRadius: BORDER_RADIUS, objectFit: 'cover', ...style }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Unit coverage for `Carousel.tsx`'s exported `cardLabel` — the pure accessible-name
 * logic behind every card's `aria-label`. See `ChapterList.test.tsx`'s header for why
 * this repo's `.test.tsx` files test pure logic rather than render the component: no
 * `jsdom`/`@testing-library/react` is installed here. The rendered carousel itself —
 * uniform card geometry, keyboard/wheel scrolling, skeleton-vs-loaded box sizing — is
 * covered by `e2e/app/for-you.spec.ts` in a real browser.
 */
import { describe, expect, it } from 'vitest';
import { cardLabel } from './Carousel.js';
import type { FeedItem } from './forYouFeed.js';

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'item-1',
    contentType: 'books',
    title: 'Dune',
    subtitle: null,
    coverSrc: 'https://covers.example/item-1',
    fallbackIcon: 'book',
    progress: null,
    ...overrides,
  };
}

describe('cardLabel', () => {
  it('is just the title when there is no subtitle', () => {
    expect(cardLabel(item({ subtitle: null }))).toBe('Dune');
  });

  it('joins title and subtitle with a comma when a subtitle is present', () => {
    expect(cardLabel(item({ subtitle: 'Frank Herbert' }))).toBe('Dune, Frank Herbert');
  });

  // Wave 15d-1-W: the accessibility mechanism for an external (ListenBrainz-derived,
  // not-owned) card — see `MusicHomePage.tsx`/`Carousel.tsx`'s doc comments. The visual
  // "Not in library" pill is `aria-hidden`, so this suffix is the only way a screen
  // reader user learns the item isn't hers.
  it('appends "not in your library" for an external item, after the subtitle', () => {
    expect(cardLabel(item({ subtitle: null, availability: 'external' }))).toBe(
      'Dune, not in your library',
    );
    expect(cardLabel(item({ subtitle: 'New artists to discover', availability: 'external' }))).toBe(
      'Dune, New artists to discover, not in your library',
    );
  });

  it('does not append anything for an owned item, whether availability is "owned" or absent', () => {
    expect(cardLabel(item({ availability: 'owned' }))).toBe('Dune');
    expect(cardLabel(item({ availability: undefined }))).toBe('Dune');
  });

  // Wave 15d-1-books-W-2, and the correction that followed it. The parity review ruled the
  // original `=== 'external'` comparison fail-unsafe and prescribed Android's `!== 'owned'`.
  // Transliterated literally that was WRONG on web and shipped a total regression: Android
  // route-scopes `availability` to a model where it is required, while web's is optional on an
  // interface shared by every item, so an ordinary owned book carries no `availability` at all
  // and the whole library rendered as "not in your library".
  //
  // The rule that is actually fail-safe: absent means owned, because that is what it means here;
  // present-but-unrecognised means external, because rendering an unknown state as an ordinary
  // owned item is what dead-ends a tap at an id no Audiobookshelf instance has heard of.
  it('treats a present but unrecognised availability as external', () => {
    expect(
      cardLabel(item({ availability: 'not-a-real-value' as unknown as FeedItem['availability'] })),
    ).toBe('Dune, not in your library');
  });
});

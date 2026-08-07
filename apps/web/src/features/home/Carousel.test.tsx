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
});

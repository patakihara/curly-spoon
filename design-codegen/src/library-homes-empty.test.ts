import { describe, expect, it } from 'vitest';
import { elements, readPage } from './test-pages.js';

describe('[M3.requests/c] a library home with nothing of yours in it', () => {
  it.each(['books', 'podcasts', 'music'])(
    '[M3.requests/c] the %s home says it is empty and points to Search',
    (home) => {
      const empty = elements(readPage(home).tree).filter((e) => e.component === 'EmptyState');
      expect(empty).toHaveLength(1);
      const words = empty[0]!.props.body;
      expect(words?.kind === 'literal' ? String(words.value) : '').toMatch(/search/i);
    },
  );
});

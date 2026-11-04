import { describe, expect, it } from 'vitest';
import { elements, readPage } from './test-pages.js';

describe('[M3.requests/c] a library home with nothing of yours in it', () => {
  it.each(['books', 'podcasts', 'music'])(
    '[M3.requests/c] the %s home says it is empty and points to Search',
    (home) => {
      const [empty] = elements(readPage(home).tree).filter((e) => e.component === 'EmptyState');
      const words = empty!.props.body;
      expect(words?.kind === 'literal' ? String(words.value) : '').toMatch(/search/i);
    },
  );

  it.each(['books', 'podcasts', 'music'])(
    '[M3.requests/c] the %s home says when its list failed to load, with a way to ask again',
    (home) => {
      const [, failed, ...others] = elements(readPage(home).tree).filter(
        (e) => e.component === 'EmptyState',
      );
      expect(others).toEqual([]);
      expect(failed!.props.body).toEqual({ kind: 'literal', value: 'The server did not answer.' });
      expect(JSON.stringify(failed!.props.action)).toContain('{"kind":"retry"}');
    },
  );
});

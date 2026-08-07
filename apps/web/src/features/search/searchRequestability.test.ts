import { describe, expect, it } from 'vitest';
import { requestabilitySections, type SearchProviderEntry } from './searchRequestability.js';
import type { VisibleKinds } from './searchFilters.js';

const NONE: VisibleKinds = {
  books: false,
  series: false,
  authors: false,
  podcasts: false,
  artists: false,
  albums: false,
  tracks: false,
};

const bothEnabled: SearchProviderEntry[] = [
  { kind: 'indexer', configured: true, enabled: true },
  { kind: 'download', configured: true, enabled: true },
  { kind: 'music', configured: true, enabled: true },
];

const visibleBooks: VisibleKinds = { ...NONE, books: true };
const visibleMusic: VisibleKinds = { ...NONE, artists: true, albums: true, tracks: true };
const visibleNone: VisibleKinds = { ...NONE };

describe('requestabilitySections', () => {
  it('shows the book-requestable group only when an indexer and a download client are both enabled, and Books is visible', () => {
    expect(requestabilitySections(bothEnabled, visibleBooks).showBookRequestable).toBe(true);
    expect(requestabilitySections(bothEnabled, visibleNone).showBookRequestable).toBe(false);
  });

  it('hides the book-requestable group when the indexer is missing, even with a download client enabled', () => {
    const noIndexer: SearchProviderEntry[] = [
      { kind: 'download', configured: true, enabled: true },
    ];
    expect(requestabilitySections(noIndexer, visibleBooks).showBookRequestable).toBe(false);
  });

  it('hides the book-requestable group when the download client is missing, even with an indexer enabled', () => {
    const noDownloadClient: SearchProviderEntry[] = [
      { kind: 'indexer', configured: true, enabled: true },
    ];
    expect(requestabilitySections(noDownloadClient, visibleBooks).showBookRequestable).toBe(false);
  });

  it('hides the book-requestable group when a provider is configured but disabled', () => {
    const disabled: SearchProviderEntry[] = [
      { kind: 'indexer', configured: true, enabled: false },
      { kind: 'download', configured: true, enabled: true },
    ];
    expect(requestabilitySections(disabled, visibleBooks).showBookRequestable).toBe(false);
  });

  it('shows the music-requestable group only when a music provider is enabled, and any music kind is visible', () => {
    expect(requestabilitySections(bothEnabled, visibleMusic).showMusicRequestable).toBe(true);
    expect(requestabilitySections(bothEnabled, visibleNone).showMusicRequestable).toBe(false);
  });

  it('hides the music-requestable group when no music provider is configured', () => {
    const noMusic: SearchProviderEntry[] = [
      { kind: 'indexer', configured: true, enabled: true },
      { kind: 'download', configured: true, enabled: true },
    ];
    expect(requestabilitySections(noMusic, visibleMusic).showMusicRequestable).toBe(false);
  });

  it('degrades to both groups hidden for an empty provider list, rather than throwing', () => {
    const sections = requestabilitySections([], visibleBooks);
    expect(sections).toEqual({ showBookRequestable: false, showMusicRequestable: false });
  });

  it('a partially-visible music selection (e.g. only Artists narrowed) still counts as music visible', () => {
    const artistsOnly: VisibleKinds = { ...NONE, artists: true };
    expect(requestabilitySections(bothEnabled, artistsOnly).showMusicRequestable).toBe(true);
  });
});

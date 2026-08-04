import { describe, expect, it } from 'vitest';
import { buildSubscribeBody } from './subscribeMetadata.js';
import type { Library, PodcastDirectoryResult, PodcastFeedPreview } from '../../api/types.js';

const library: Library = {
  id: 'lib-podcasts',
  name: 'Podcasts',
  mediaType: 'podcast',
  icon: 'podcast',
  folders: [{ id: 'folder-podcasts', path: '/data/podcasts' }],
};

const preview: PodcastFeedPreview = {
  title: 'The Daily Tech Digest',
  author: 'Tech Media Collective',
  description: 'A daily rundown of technology news.',
  descriptionPlain: 'A daily rundown of technology news.',
  feedUrl: 'https://feeds.fake.abs.local/daily-tech.xml',
  image: 'https://fake.abs.local/covers/daily-tech.jpg',
  categories: ['Technology', 'News'],
  language: 'en-us',
  explicit: false,
  numEpisodes: 1,
  episodes: [],
  pubDate: 'Mon, 01 Jan 2024 08:00:00 GMT',
  link: 'https://fake.abs.local/daily-tech',
};

const directoryResult: PodcastDirectoryResult = {
  itunesId: 987654321,
  itunesArtistId: 123456,
  title: 'The Daily Tech Digest',
  artistName: 'Tech Media Collective',
  description: 'A daily rundown of technology news.',
  descriptionPlain: 'A daily rundown of technology news.',
  releaseDate: '2020-01-01T08:00:00Z',
  genres: ['Technology', 'News'],
  cover: 'https://fake.abs.local/covers/daily-tech.jpg',
  trackCount: 500,
  feedUrl: 'https://feeds.fake.abs.local/daily-tech.xml',
  pageUrl: 'https://podcasts.apple.com/podcast/id987654321',
  explicit: false,
};

describe('buildSubscribeBody', () => {
  it('builds a full subscribe body from a preview reached via a directory result', () => {
    const body = buildSubscribeBody({
      preview,
      rssFeed: preview.feedUrl!,
      library,
      directoryResult,
    });

    expect(body).toEqual({
      libraryId: 'lib-podcasts',
      folderId: 'folder-podcasts',
      folderPath: '/data/podcasts',
      rssFeed: 'https://feeds.fake.abs.local/daily-tech.xml',
      title: 'The Daily Tech Digest',
      metadata: {
        author: 'Tech Media Collective',
        description: 'A daily rundown of technology news.',
        releaseDate: '2020-01-01T08:00:00Z',
        imageUrl: 'https://fake.abs.local/covers/daily-tech.jpg',
        genres: ['Technology', 'News'],
        language: 'en-us',
        explicit: false,
        itunesPageUrl: 'https://podcasts.apple.com/podcast/id987654321',
        itunesId: 987654321,
      },
      autoDownloadEpisodes: undefined,
    });
  });

  it('omits itunes fields and falls back to the feed pubDate when there is no directory result (pasted RSS URL)', () => {
    const body = buildSubscribeBody({
      preview,
      rssFeed: preview.feedUrl!,
      library,
    });

    expect(body?.metadata?.itunesId).toBeNull();
    expect(body?.metadata?.itunesPageUrl).toBeNull();
    expect(body?.metadata?.releaseDate).toBe('Mon, 01 Jan 2024 08:00:00 GMT');
  });

  it("falls back to the directory result's title when the feed preview has none", () => {
    const body = buildSubscribeBody({
      preview: { ...preview, title: null },
      rssFeed: preview.feedUrl!,
      library,
      directoryResult,
    });

    expect(body?.title).toBe('The Daily Tech Digest');
  });

  it('returns null when neither the preview nor the directory result has a usable title', () => {
    const body = buildSubscribeBody({
      preview: { ...preview, title: '   ' },
      rssFeed: preview.feedUrl!,
      library,
    });

    expect(body).toBeNull();
  });

  it('returns null when the target library has no folder to subscribe into', () => {
    const body = buildSubscribeBody({
      preview,
      rssFeed: preview.feedUrl!,
      library: { ...library, folders: [] },
    });

    expect(body).toBeNull();
  });

  it('passes autoDownloadEpisodes through unchanged', () => {
    const body = buildSubscribeBody({
      preview,
      rssFeed: preview.feedUrl!,
      library,
      autoDownloadEpisodes: true,
    });

    expect(body?.autoDownloadEpisodes).toBe(true);
  });
});

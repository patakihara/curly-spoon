import { describe, expect, it } from 'vitest';
import {
  Availability,
  RequestFailure,
  RequestMedium,
  RequestRef,
  RequestStatus,
} from '../src/index.js';

const mbid = '3f8a5e7c-1b2d-4e6f-9a0b-c1d2e3f4a5b6';

describe('the request vocabulary', () => {
  it('names every status a request passes, from made to in your library, and failed', () => {
    expect(RequestStatus.options).toEqual([
      'requested',
      'searching',
      'needsChoice',
      'queued',
      'downloading',
      'importing',
      'inLibrary',
      'failed',
    ]);
  });

  it('requests books, albums, songs and podcasts', () => {
    expect(RequestMedium.options).toEqual(['book', 'album', 'song', 'podcast']);
  });

  it('says why a request failed by a key, never free text', () => {
    expect(RequestFailure.options).toEqual([
      'noRelease',
      'searchFailed',
      'downloadFailed',
      'importFailed',
      'notIndexed',
      'cancelledUpstream',
    ]);
    expect(RequestFailure.safeParse('the tracker was down').success).toBe(false);
  });

  it('shows every status on a card, with progress only while downloading', () => {
    for (const status of RequestStatus.options) {
      expect(Availability.safeParse({ kind: 'requested', status }).success, status).toBe(true);
      expect(
        Availability.safeParse({ kind: 'requested', status, progress: 0.5 }).success,
        status,
      ).toBe(status === 'downloading');
    }
  });
});

describe('what is requested', () => {
  it('takes a feed only at an http or https address with no credentials', () => {
    const feed = (feedUrl: string) =>
      RequestRef.safeParse({
        medium: 'podcast',
        target: { title: 'A Show', creator: null, ids: { feedUrl } },
      }).success;
    expect(feed('https://feeds.example.com/show')).toBe(true);
    expect(feed('http://feeds.example.com/show')).toBe(true);
    expect(feed('file:///etc/passwd')).toBe(false);
    expect(feed('ftp://feeds.example.com/show')).toBe(false);
    expect(feed('gopher://feeds.example.com/show')).toBe(false);
    expect(feed('https://user:secret@feeds.example.com/show')).toBe(false);
    expect(feed('https://user@feeds.example.com/show')).toBe(false);
    expect(feed('https://:secret@feeds.example.com/show')).toBe(false);
  });

  it('names a book by its ASIN or ISBN, an album by its MusicBrainz release, a song by its YouTube Music id, a podcast by its feed', () => {
    for (const ref of [
      {
        medium: 'book',
        target: { title: 'Powers', creator: 'Ursula K. Le Guin', ids: { asin: 'B0036S4B76' } },
      },
      {
        medium: 'book',
        target: { title: 'Powers', creator: null, ids: { isbn: '9780152057701' } },
      },
      {
        medium: 'album',
        target: { title: 'Fragments', creator: 'Fleeting Verses', ids: { mbid } },
      },
      {
        medium: 'song',
        target: { title: 'Glass', creator: 'Rosa', ids: { youtubeMusicId: 'dQw4w9WgXcQ' } },
      },
      {
        medium: 'podcast',
        target: {
          title: 'The Long Read',
          creator: null,
          ids: { feedUrl: 'https://example.org/feed.xml' },
        },
      },
    ]) {
      expect(RequestRef.parse(ref), JSON.stringify(ref)).toEqual(ref);
    }
  });

  it('refuses a request without the catalogue id its medium is named by', () => {
    for (const ref of [
      { medium: 'book', target: { title: 'Powers', creator: null, ids: { mbid } } },
      { medium: 'album', target: { title: 'Fragments', creator: null, ids: {} } },
      { medium: 'song', target: { title: 'Glass', creator: null, ids: { mbid } } },
      {
        medium: 'podcast',
        target: { title: 'Long Read', creator: null, ids: { asin: 'B0036S4B76' } },
      },
    ]) {
      expect(RequestRef.safeParse(ref).success, JSON.stringify(ref)).toBe(false);
    }
  });

  it('refuses malformed ids, a feed that is not a web address, an empty title, and fields it does not know', () => {
    const book = (ids: object, extra: object = {}) => ({
      medium: 'book',
      target: { title: 'Powers', creator: null, ids, ...extra },
    });
    expect(RequestRef.safeParse(book({ asin: 'short' })).success).toBe(false);
    expect(RequestRef.safeParse(book({ isbn: '12345' })).success).toBe(false);
    expect(
      RequestRef.safeParse({
        medium: 'podcast',
        target: { title: 'x', creator: null, ids: { feedUrl: 'file:///etc/passwd' } },
      }).success,
    ).toBe(false);
    expect(
      RequestRef.safeParse({
        medium: 'book',
        target: { title: '', creator: null, ids: { asin: 'B0036S4B76' } },
      }).success,
    ).toBe(false);
    expect(RequestRef.safeParse(book({ asin: 'B0036S4B76' }, { url: 'magnet:?' })).success).toBe(
      false,
    );
  });
});

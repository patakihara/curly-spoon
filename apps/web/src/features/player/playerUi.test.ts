import { describe, expect, it, vi } from 'vitest';
import {
  defaultBookmarkTitle,
  endOfChapterMs,
  formatRemaining,
  nowPlayingContextLine,
  playerArtworkUrl,
  playerDisplayMeta,
  remainingSeconds,
} from './playerUi.js';

const chapters = [
  { id: 1, start: 0, end: 100, title: 'Chapter One' },
  { id: 2, start: 100, end: 250, title: 'Chapter Two' },
];

describe('remainingSeconds', () => {
  it('subtracts elapsed time from duration', () => {
    expect(remainingSeconds(30, 100)).toBe(70);
  });

  it('never goes negative when currentTime overshoots duration', () => {
    expect(remainingSeconds(150, 100)).toBe(0);
  });

  it('is zero when nothing is loaded (duration 0)', () => {
    expect(remainingSeconds(0, 0)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('prefixes the formatted duration with a minus sign', () => {
    expect(formatRemaining(30, 100)).toBe('-1:10');
  });

  it('reads "-0:00" at the very end rather than "-0:00" flipping positive', () => {
    expect(formatRemaining(100, 100)).toBe('-0:00');
  });

  it('reads "-0:00" when duration is 0', () => {
    expect(formatRemaining(0, 0)).toBe('-0:00');
  });
});

describe('endOfChapterMs', () => {
  it('is the distance in ms to the current chapter’s end', () => {
    expect(endOfChapterMs(chapters, 40)).toBe(60_000);
  });

  it('is zero, not negative, exactly on a chapter boundary', () => {
    expect(endOfChapterMs(chapters, 250)).toBe(0);
  });

  it('is null when there is no current chapter', () => {
    expect(endOfChapterMs([], 40)).toBeNull();
  });
});

describe('defaultBookmarkTitle', () => {
  it('uses the current chapter’s title when one exists', () => {
    expect(defaultBookmarkTitle(chapters, 40)).toBe('Chapter One');
  });

  it('falls back to a formatted timestamp with no chapter data', () => {
    expect(defaultBookmarkTitle([], 90)).toBe('1:30');
  });
});

describe('playerDisplayMeta', () => {
  it('shows the episode’s own title over the podcast’s, when an episode is loaded', () => {
    expect(
      playerDisplayMeta({
        kind: 'podcast',
        episodeId: 'ep-1',
        displayTitle: 'The One About Rust',
        itemTitle: 'Daily Tech Briefing',
        authors: 'Signal Media',
      }),
    ).toEqual({ primary: 'The One About Rust', secondary: 'Daily Tech Briefing' });
  });

  it('shows the book’s title and author, unchanged, when no episode is loaded', () => {
    expect(
      playerDisplayMeta({
        kind: 'book',
        episodeId: null,
        displayTitle: 'Dune',
        itemTitle: 'Dune',
        authors: 'Frank Herbert',
      }),
    ).toEqual({ primary: 'Dune', secondary: 'Frank Herbert' });
  });

  it('falls back to the item’s own title if an episode session ever arrives with a blank displayTitle', () => {
    expect(
      playerDisplayMeta({
        kind: 'podcast',
        episodeId: 'ep-1',
        displayTitle: '',
        itemTitle: 'Daily Tech Briefing',
        authors: 'Signal Media',
      }),
    ).toEqual({ primary: 'Daily Tech Briefing', secondary: 'Daily Tech Briefing' });
  });

  it('shows the current track’s own title over the artist, for a loaded music queue', () => {
    // Unlike an episode, `displayTitle` is frozen at the album's `load()` time (track 1),
    // never updated as the queue advances — `currentTrackTitle` (`trackAt(tracks,
    // currentTime)?.track.title`, computed fresh by the caller every render) is what
    // actually tracks which song is playing right now.
    expect(
      playerDisplayMeta({
        kind: 'track',
        episodeId: null,
        displayTitle: 'Track One',
        itemTitle: 'Some Album',
        authors: 'The Artists',
        currentTrackTitle: 'Track Three',
      }),
    ).toEqual({ primary: 'Track Three', secondary: 'The Artists' });
  });

  it('falls back to displayTitle, then the album title, if the current track can’t be resolved', () => {
    expect(
      playerDisplayMeta({
        kind: 'track',
        episodeId: null,
        displayTitle: 'Track One',
        itemTitle: 'Some Album',
        authors: 'The Artists',
        currentTrackTitle: null,
      }),
    ).toEqual({ primary: 'Track One', secondary: 'The Artists' });

    expect(
      playerDisplayMeta({
        kind: 'track',
        episodeId: null,
        displayTitle: '',
        itemTitle: 'Some Album',
        authors: 'The Artists',
        currentTrackTitle: null,
      }),
    ).toEqual({ primary: 'Some Album', secondary: 'The Artists' });
  });

  // Regression coverage for the "every track credits the album/playlist artist" bug fixed
  // alongside `musicQueue.ts`'s `QueueTrack.artist`. `authors` ('Various Artists', the
  // queue-level fallback) deliberately differs from `currentTrackArtist` ('Led Zeppelin') so
  // this can't pass with the fix reverted — a fixture where the two agree would pass either
  // way, which is exactly the false positive this project has shipped for this bug class
  // before.
  it("prefers the current track's own artist over the queue-level authors fallback", () => {
    expect(
      playerDisplayMeta({
        kind: 'track',
        episodeId: null,
        displayTitle: 'Immigrant Song',
        itemTitle: 'Best Of Rock',
        authors: 'Various Artists',
        currentTrackTitle: 'Immigrant Song',
        currentTrackArtist: 'Led Zeppelin',
      }).secondary,
    ).toBe('Led Zeppelin');
  });

  it('falls back to the queue-level authors when the current track has no artist of its own', () => {
    expect(
      playerDisplayMeta({
        kind: 'track',
        episodeId: null,
        displayTitle: 'Kashmir',
        itemTitle: 'Best Of Rock',
        authors: 'Various Artists',
        currentTrackTitle: 'Kashmir',
        currentTrackArtist: null,
      }).secondary,
    ).toBe('Various Artists');
  });

  it('degrades to an empty string, not "null" or a crash, when neither the track nor the queue has an artist', () => {
    // Mirrors a playlist, which has no queue-level artist of its own at all (`authors: ''`,
    // `MusicPlaylistPage.tsx`'s `media: { author: null }`).
    expect(
      playerDisplayMeta({
        kind: 'track',
        episodeId: null,
        displayTitle: 'Kashmir',
        itemTitle: 'My Playlist',
        authors: '',
        currentTrackTitle: 'Kashmir',
        currentTrackArtist: null,
      }).secondary,
    ).toBe('');
  });
});

describe('playerArtworkUrl', () => {
  function fakeApi() {
    return {
      coverUrl: vi.fn(
        (itemId: string, options?: { width?: number }) =>
          `/media/${itemId}/cover?width=${options?.width ?? ''}`,
      ),
      jellyfinArtworkUrl: vi.fn((itemId: string) => `/jellyfin/items/${itemId}/artwork`),
    };
  }

  it('uses the Audiobookshelf cover route, sized per surface, for a book or podcast', () => {
    const api = fakeApi();
    expect(playerArtworkUrl(api, { kind: 'book', itemId: 'item-1', width: 96 })).toBe(
      '/media/item-1/cover?width=96',
    );
    expect(api.coverUrl).toHaveBeenCalledWith('item-1', { width: 96 });
    expect(api.jellyfinArtworkUrl).not.toHaveBeenCalled();
  });

  it('uses the proxied Jellyfin artwork route for a track, ignoring width — that route has no resize option', () => {
    const api = fakeApi();
    expect(playerArtworkUrl(api, { kind: 'track', itemId: 'album-1', width: 640 })).toBe(
      '/jellyfin/items/album-1/artwork',
    );
    expect(api.jellyfinArtworkUrl).toHaveBeenCalledWith('album-1');
    expect(api.coverUrl).not.toHaveBeenCalled();
  });
});

// Wave 16e-nowplaying (docs/design/screens/NOW_PLAYING.md §6.3): the Now Playing surface's
// new "Playing from X" context line for music.
describe('nowPlayingContextLine', () => {
  it('composes the literal "Playing from {album}" string', () => {
    expect(nowPlayingContextLine('Driftwave')).toBe('Playing from Driftwave');
  });

  it('is null for a blank title, so a container-less queue source omits the line rather than rendering "Playing from "', () => {
    expect(nowPlayingContextLine('')).toBeNull();
  });

  it('is null for a whitespace-only title', () => {
    expect(nowPlayingContextLine('   ')).toBeNull();
  });

  it('trims surrounding whitespace from an otherwise real title', () => {
    expect(nowPlayingContextLine('  Driftwave  ')).toBe('Playing from Driftwave');
  });
});

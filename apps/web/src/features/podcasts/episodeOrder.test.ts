import { describe, expect, it } from 'vitest';
import { sortEpisodes } from './episodeOrder.js';
import type { PodcastEpisode } from '../../api/types.js';

function episode(id: string, publishedAt: number | null): PodcastEpisode {
  return {
    id,
    index: null,
    season: null,
    episodeNumber: null,
    title: id,
    subtitle: null,
    description: null,
    publishedAt,
    duration: 300,
    audioTrack: null,
  };
}

describe('sortEpisodes', () => {
  it('defaults to newest first', () => {
    const episodes = [episode('a', 1000), episode('b', 3000), episode('c', 2000)];

    const sorted = sortEpisodes(episodes);

    expect(sorted.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders oldest first when asked', () => {
    const episodes = [episode('a', 1000), episode('b', 3000), episode('c', 2000)];

    const sorted = sortEpisodes(episodes, 'oldest');

    expect(sorted.map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts episodes with no publish date last, regardless of direction', () => {
    const episodes = [episode('undated', null), episode('a', 1000), episode('b', 2000)];

    expect(sortEpisodes(episodes, 'newest').map((e) => e.id)).toEqual(['b', 'a', 'undated']);
    expect(sortEpisodes(episodes, 'oldest').map((e) => e.id)).toEqual(['a', 'b', 'undated']);
  });

  it('does not mutate the input array', () => {
    const episodes = [episode('a', 1000), episode('b', 2000)];
    const original = [...episodes];

    sortEpisodes(episodes, 'oldest');

    expect(episodes).toEqual(original);
  });
});

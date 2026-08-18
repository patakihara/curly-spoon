import { describe, expect, it } from 'vitest';
import { composePodcastMeta } from './podcastMeta.js';

describe('composePodcastMeta', () => {
  it('omits the line entirely for a podcast with no episodes', () => {
    expect(composePodcastMeta(0, 0)).toBeNull();
  });

  it('uses the singular "episode" for exactly one episode', () => {
    expect(composePodcastMeta(1, 0)).toBe('1 episode · 0 unplayed');
  });

  it('shows "0 unplayed" rather than omitting it — caught up is a real state', () => {
    expect(composePodcastMeta(5, 0)).toBe('5 episodes · 0 unplayed');
  });

  it("joins episode and unplayed counts per the design's own example", () => {
    expect(composePodcastMeta(128, 3)).toBe('128 episodes · 3 unplayed');
  });
});

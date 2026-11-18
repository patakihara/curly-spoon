import { describe, expect, it } from 'vitest';
import { podcastFolderName, podcastPaths } from './place.js';

describe('[M3.podcasts/a] where a new show goes in the Podcasts folder', () => {
  it('[M3.podcasts/a] names the folder by the title, without the characters a folder name refuses or leading dots', () => {
    expect(podcastFolderName("Dan Carlin's Hardcore History")).toBe(
      "Dan Carlin's Hardcore History",
    );
    expect(podcastFolderName('..Why? A/B: "Tests" <1|2> *now*\\')).toBe('Why AB Tests 12 now');
    expect(podcastFolderName('x'.repeat(200))).toHaveLength(120);
  });

  it('[M3.podcasts/a] falls back to a plain name when nothing of the title is left', () => {
    expect(podcastFolderName('???')).toBe('Podcast');
  });

  it('[M3.podcasts/a] tries the folder, then " (2)", then " (3)"', () => {
    expect(podcastPaths('/data/Podcasts', 'Show')).toEqual([
      '/data/Podcasts/Show',
      '/data/Podcasts/Show (2)',
      '/data/Podcasts/Show (3)',
    ]);
  });
});

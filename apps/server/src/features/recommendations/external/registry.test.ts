import { describe, expect, it } from 'vitest';
import { LISTENBRAINZ_PROVIDER_NAME } from './listenbrainz.js';
import { externalProviderFactories, getExternalProvidersForMedium } from './registry.js';
import type { ExternalProviderFactory } from './registry.js';
import type {
  ExternalCandidate,
  ExternalRecommendationProvider,
  RecommendationSeed,
} from './types.js';

/** A provider that exists nowhere but this test — the point is to prove the *interface*
 * works for any conforming implementation, not to re-test ListenBrainz. */
function fakePodcastProvider(): ExternalRecommendationProvider {
  return {
    providerName: 'fake-podcast-provider',
    medium: 'podcast',
    async recommend(
      seeds: readonly RecommendationSeed[],
      limit = 10,
    ): Promise<ExternalCandidate[]> {
      return seeds.slice(0, limit).map((seed, index) => ({
        providerName: 'fake-podcast-provider',
        providerId: `fake-episode-${index}`,
        medium: 'podcast',
        title: `Recommended because you like ${seed.label}`,
        authors: [],
        genres: ['news'],
        identifiers: { feedUrl: `https://example.test/feeds/${index}.xml` },
        reason: `Similar to ${seed.label}`,
      }));
    },
  };
}

describe('getExternalProvidersForMedium', () => {
  it('returns only providers registered for the requested medium', () => {
    const fakeFactory: ExternalProviderFactory = () => fakePodcastProvider();
    const factories = { fake: fakeFactory, listenbrainz: externalProviderFactories.listenbrainz! };

    const podcastProviders = getExternalProvidersForMedium(
      'podcast',
      { fetch: async () => new Response('{}') },
      factories,
    );
    const musicProviders = getExternalProvidersForMedium(
      'music',
      { fetch: async () => new Response('{}') },
      factories,
    );
    const bookProviders = getExternalProvidersForMedium(
      'book',
      { fetch: async () => new Response('{}') },
      factories,
    );

    expect(podcastProviders.map((p) => p.providerName)).toEqual(['fake-podcast-provider']);
    expect(musicProviders.map((p) => p.providerName)).toEqual([LISTENBRAINZ_PROVIDER_NAME]);
    expect(bookProviders).toEqual([]);
  });

  // The end-to-end proof the wave's own spec asks for: build a fake provider, run it through
  // the real interface (not a mock of `recommend`), and assert real `ExternalCandidate`s come
  // out the other end with identifiers populated. This is the "reader" for this wave's own
  // tests; the real reader — a route or shelf builder calling this registry — arrives in
  // 15c/15e (see this wave's report and `ROADMAP.md` §15).
  it('exercises the seam end to end through a fake provider, with identifiers populated', async () => {
    const factories: Record<string, ExternalProviderFactory> = {
      fake: () => fakePodcastProvider(),
    };
    const seeds: RecommendationSeed[] = [{ label: 'The Daily', identifiers: { feedUrl: null } }];

    const [provider] = getExternalProvidersForMedium(
      'podcast',
      { fetch: async () => new Response('{}') },
      factories,
    );
    expect(provider).toBeDefined();

    const candidates = await provider!.recommend(seeds);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      providerName: 'fake-podcast-provider',
      medium: 'podcast',
      title: 'Recommended because you like The Daily',
      reason: 'Similar to The Daily',
    });
    expect(candidates[0]!.identifiers.feedUrl).toBe('https://example.test/feeds/0.xml');
  });

  it('the real registry currently has no book or podcast provider — mechanism only, until 15e', () => {
    const deps = { fetch: async () => new Response('{}') };
    expect(getExternalProvidersForMedium('book', deps)).toEqual([]);
    expect(getExternalProvidersForMedium('podcast', deps)).toEqual([]);
    expect(getExternalProvidersForMedium('music', deps).map((p) => p.providerName)).toEqual([
      LISTENBRAINZ_PROVIDER_NAME,
    ]);
  });
});

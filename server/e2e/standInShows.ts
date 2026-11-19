/**
 * Podcasts on the recorded server, for the browser's tests: Search finds shows in iTunes' recorded
 * answers, with the deep-inertia stand-in as every cover and no pasted feed read, and a show asked
 * for walks its route in one go and arrives as the recorded show `arrives` names, as Audiobookshelf
 * would subscribe to it. Audiobookshelf's subscribe calls answer for a throwaway library, so they are
 * not replayed here. Never in the image: only `e2e/` builds this.
 */
import { readFileSync } from 'node:fs';
import type { MediaRef } from '@auralis/schema';
import { type Recording } from '../src/adapters/http/recording.js';
import { replayFetch } from '../src/adapters/http/replay.js';
import { ITUNES_URL, ItunesClient } from '../src/adapters/itunes/client.js';
import type { MediumSteps } from '../src/requests/steps.js';
import { type ShowCatalogue, showCatalogue } from '../src/search/podcasts.js';

export function standInShows(
  recordings: Recording[],
  options: { art: string; arrives: MediaRef },
): { catalogue: ShowCatalogue; steps: MediumSteps } {
  const cover = readFileSync(options.art);
  const catalogue = showCatalogue({
    itunes: new ItunesClient({ baseUrl: ITUNES_URL, fetch: replayFetch(recordings) }),
    feed: () => Promise.reject(new Error('the stand-in reads no pasted feed')),
    fetchArt: async () => new Response(cover, { headers: { 'content-type': 'image/jpeg' } }),
    log: { error: () => undefined },
  });
  const steps: MediumSteps = {
    medium: 'podcast',
    prompt: true,
    search: async ({ target }) => ({
      kind: 'picked',
      release: { id: 'feed', title: target.title, source: 'Podcast feed', size: null, details: {} },
      others: [],
    }),
    import: async () => ({ kind: 'arrived', ref: options.arrives }),
  };
  return { catalogue, steps };
}

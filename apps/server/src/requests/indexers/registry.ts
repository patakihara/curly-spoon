/**
 * The indexers Auralis knows how to build.
 *
 * One map from provider id to factory, so "support another indexer" is a new file plus a
 * line here. `describeIndexers` is what the settings screen lists; it is deliberately
 * static — the UI must be able to offer a provider that has never been configured.
 */

import type { IndexerFactory, ProviderDescriptor } from '../types.js';
import { createAudiobookBayIndexer } from './audiobookbay.js';
import { createProwlarrIndexer } from './prowlarr.js';

export const indexerFactories: Record<string, IndexerFactory> = {
  prowlarr: createProwlarrIndexer,
  audiobookbay: createAudiobookBayIndexer,
};

export const indexerDescriptors: ProviderDescriptor[] = [
  {
    id: 'prowlarr',
    displayName: 'Prowlarr',
    kind: 'indexer',
    requiresBaseUrl: true,
    requiresSecret: true,
    secretFields: [{ key: 'apiKey', label: 'API key', kind: 'password' }],
    summary:
      'Searches every indexer Prowlarr is configured with, and solves Cloudflare challenges via FlareSolverr. The recommended source.',
  },
  {
    id: 'audiobookbay',
    displayName: 'AudiobookBay',
    kind: 'indexer',
    requiresBaseUrl: false,
    requiresSecret: false,
    secretFields: [],
    summary:
      'Scrapes AudiobookBay directly. No extra service to run, but it cannot pass Cloudflare and the site moves domain often.',
  },
];

export function describeIndexers(): ProviderDescriptor[] {
  return [...indexerDescriptors].sort((a, b) => a.id.localeCompare(b.id));
}

/** `null` for an id this build does not know, so an orphaned database row is not a crash. */
export function getIndexerFactory(id: string): IndexerFactory | null {
  return indexerFactories[id] ?? null;
}

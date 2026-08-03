/**
 * The indexers Auralis knows how to build.
 *
 * One map from provider id to factory, so "support another indexer" is a new file plus a
 * line here. `describeIndexers` is what the settings screen lists; it is deliberately
 * static — the UI must be able to offer a provider that has never been configured.
 */

import type { IndexerFactory, ProviderDescriptor } from '../types.js';

export const indexerFactories: Record<string, IndexerFactory> = {};

export const indexerDescriptors: ProviderDescriptor[] = [];

export function describeIndexers(): ProviderDescriptor[] {
  return [...indexerDescriptors].sort((a, b) => a.id.localeCompare(b.id));
}

/** `null` for an id this build does not know, so an orphaned database row is not a crash. */
export function getIndexerFactory(id: string): IndexerFactory | null {
  return indexerFactories[id] ?? null;
}

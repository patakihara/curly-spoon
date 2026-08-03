/**
 * The download clients Auralis knows how to build. Mirrors `indexers/registry.ts` — see
 * there for why the descriptor list is static rather than derived from what is configured.
 */

import type { DownloadClientFactory, ProviderDescriptor } from '../types.js';

export const downloadClientFactories: Record<string, DownloadClientFactory> = {};

export const downloadClientDescriptors: ProviderDescriptor[] = [];

export function describeDownloadClients(): ProviderDescriptor[] {
  return [...downloadClientDescriptors].sort((a, b) => a.id.localeCompare(b.id));
}

/** `null` for an id this build does not know, so an orphaned database row is not a crash. */
export function getDownloadClientFactory(id: string): DownloadClientFactory | null {
  return downloadClientFactories[id] ?? null;
}

/**
 * The music providers Auralis knows how to build. Mirrors `indexers/registry.ts` and
 * `download/registry.ts` — see there for why the descriptor list is static rather than
 * derived from what is configured. A separate registry (rather than folding into either of
 * those two) because `MusicRequestProvider` is its own interface, not an `IndexerProvider`
 * or a `DownloadClientProvider` — see `../types.ts`'s file comment on that type for why.
 */

import type { MusicProviderFactory, ProviderDescriptor } from '../types.js';
import { createSlskdProvider } from './slskd.js';

export const musicProviderFactories: Record<string, MusicProviderFactory> = {
  slskd: createSlskdProvider,
};

export const musicProviderDescriptors: ProviderDescriptor[] = [
  {
    id: 'slskd',
    displayName: 'slskd',
    kind: 'music',
    requiresBaseUrl: true,
    requiresSecret: true,
    secretFields: [{ key: 'apiKey', label: 'API key', kind: 'password' }],
    summary:
      'A Soulseek client/server. Searches and downloads are both peer-to-peer, so results depend on who is online right now.',
  },
];

export function describeMusicProviders(): ProviderDescriptor[] {
  return [...musicProviderDescriptors].sort((a, b) => a.id.localeCompare(b.id));
}

/** `null` for an id this build does not know, so an orphaned database row is not a crash. */
export function getMusicProviderFactory(id: string): MusicProviderFactory | null {
  return musicProviderFactories[id] ?? null;
}

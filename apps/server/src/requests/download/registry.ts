/**
 * The download clients Auralis knows how to build. Mirrors `indexers/registry.ts` — see
 * there for why the descriptor list is static rather than derived from what is configured.
 */

import type { DownloadClientFactory, ProviderDescriptor } from '../types.js';
import { createQbittorrentClient } from './qbittorrent.js';
import { createTransmissionClient } from './transmission.js';

export const downloadClientFactories: Record<string, DownloadClientFactory> = {
  qbittorrent: createQbittorrentClient,
  transmission: createTransmissionClient,
};

export const downloadClientDescriptors: ProviderDescriptor[] = [
  {
    id: 'qbittorrent',
    displayName: 'qBittorrent',
    kind: 'download',
    requiresBaseUrl: true,
    requiresSecret: true,
    secretFields: [
      { key: 'username', label: 'Username', kind: 'text' },
      { key: 'password', label: 'Password', kind: 'password' },
    ],
    summary:
      'The most common choice, and the one with categories. Needs a WebUI username and password.',
  },
  {
    id: 'transmission',
    displayName: 'Transmission',
    kind: 'download',
    requiresBaseUrl: true,
    requiresSecret: false,
    secretFields: [
      { key: 'username', label: 'Username', kind: 'text' },
      { key: 'password', label: 'Password', kind: 'password' },
    ],
    summary: 'Lighter, and usually runs unauthenticated on a LAN. Labels stand in for categories.',
  },
];

export function describeDownloadClients(): ProviderDescriptor[] {
  return [...downloadClientDescriptors].sort((a, b) => a.id.localeCompare(b.id));
}

/** `null` for an id this build does not know, so an orphaned database row is not a crash. */
export function getDownloadClientFactory(id: string): DownloadClientFactory | null {
  return downloadClientFactories[id] ?? null;
}

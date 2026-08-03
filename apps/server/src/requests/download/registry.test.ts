import { describe, expect, it } from 'vitest';
import {
  describeDownloadClients,
  downloadClientDescriptors,
  downloadClientFactories,
  getDownloadClientFactory,
} from './registry.js';

describe('download client registry', () => {
  it('resolves both known ids to a factory', () => {
    expect(getDownloadClientFactory('qbittorrent')).toBe(downloadClientFactories.qbittorrent);
    expect(getDownloadClientFactory('transmission')).toBe(downloadClientFactories.transmission);
  });

  it('returns null for an id this build does not know, so an orphaned database row is not a crash', () => {
    expect(getDownloadClientFactory('deluge')).toBeNull();
  });

  it('sorts describeDownloadClients() by id', () => {
    const ids = describeDownloadClients().map((d) => d.id);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  it('has a matching factory for every descriptor, and vice versa', () => {
    const descriptorIds = downloadClientDescriptors.map((d) => d.id).sort();
    const factoryIds = Object.keys(downloadClientFactories).sort();
    expect(descriptorIds).toEqual(factoryIds);
  });
});

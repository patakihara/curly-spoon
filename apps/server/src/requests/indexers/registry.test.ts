import { describe, expect, it } from 'vitest';
import {
  describeIndexers,
  getIndexerFactory,
  indexerDescriptors,
  indexerFactories,
} from './registry.js';

describe('indexer registry', () => {
  it('resolves both known indexer ids to a factory', () => {
    expect(getIndexerFactory('prowlarr')).toBe(indexerFactories.prowlarr);
    expect(getIndexerFactory('audiobookbay')).toBe(indexerFactories.audiobookbay);
  });

  it('returns null for an id this build does not know', () => {
    expect(getIndexerFactory('nope')).toBeNull();
  });

  it('describeIndexers returns both descriptors, sorted by id', () => {
    const described = describeIndexers();
    expect(described.map((d) => d.id)).toEqual(['audiobookbay', 'prowlarr']);
  });

  it('every descriptor has a matching factory', () => {
    for (const descriptor of indexerDescriptors) {
      expect(indexerFactories[descriptor.id]).toBeDefined();
    }
  });
});

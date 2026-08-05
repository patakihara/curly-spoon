import { describe, expect, it } from 'vitest';
import {
  describeMusicProviders,
  getMusicProviderFactory,
  musicProviderDescriptors,
  musicProviderFactories,
} from './registry.js';

describe('music provider registry', () => {
  it('resolves the known slskd id to a factory', () => {
    expect(getMusicProviderFactory('slskd')).toBe(musicProviderFactories.slskd);
  });

  it('returns null for an id this build does not know', () => {
    expect(getMusicProviderFactory('deemix')).toBeNull();
  });

  it('describeMusicProviders returns every descriptor, sorted by id', () => {
    expect(describeMusicProviders().map((d) => d.id)).toEqual(['slskd']);
  });

  it('every descriptor is kind "music" and has a matching factory', () => {
    for (const descriptor of musicProviderDescriptors) {
      expect(descriptor.kind).toBe('music');
      expect(musicProviderFactories[descriptor.id]).toBeDefined();
    }
  });
});

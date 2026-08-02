import { describe, expect, it } from 'vitest';
import { buildAudioTrackPath, buildCoverPath } from './urls.js';

describe('buildCoverPath', () => {
  it('builds a bare cover path when no transform is requested', () => {
    expect(buildCoverPath('item-1')).toBe('/api/items/item-1/cover');
  });

  it('appends only the requested transform params', () => {
    expect(buildCoverPath('item-1', { width: 400 })).toBe('/api/items/item-1/cover?width=400');
  });

  it('appends every provided param', () => {
    const path = buildCoverPath('item-1', { width: 400, height: 400, format: 'webp', raw: true });
    expect(path).toBe('/api/items/item-1/cover?width=400&height=400&format=webp&raw=true');
  });

  it('URL-encodes the item id', () => {
    expect(buildCoverPath('a/b c')).toBe('/api/items/a%2Fb%20c/cover');
  });
});

describe('buildAudioTrackPath', () => {
  it('builds the file path from item and file ids', () => {
    expect(buildAudioTrackPath('item-1', 'file-2')).toBe('/api/items/item-1/file/file-2');
  });

  it('URL-encodes both ids', () => {
    expect(buildAudioTrackPath('a/b', 'c d')).toBe('/api/items/a%2Fb/file/c%20d');
  });
});

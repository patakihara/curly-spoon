import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import {
  deleteProviderConfig,
  getProviderConfig,
  listProviderConfigs,
  setProviderConfig,
} from './providerConfigRepo.js';

const SECRET = 'a'.repeat(32);

function baseInput() {
  return {
    id: 'prowlarr',
    kind: 'indexer' as const,
    enabled: true,
    baseUrl: 'http://prowlarr.example:9696',
    options: { categories: [3030] },
  };
}

describe('providerConfigRepo', () => {
  it('returns null for a provider that was never configured', () => {
    const db = openDatabase(':memory:');
    expect(getProviderConfig(db, 'prowlarr', SECRET)).toBeNull();
  });

  it('round-trips a provider with its secret decrypted', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, { ...baseInput(), secret: 'api-key-123' }, SECRET);

    const saved = getProviderConfig(db, 'prowlarr', SECRET);
    expect(saved).toMatchObject({
      id: 'prowlarr',
      kind: 'indexer',
      enabled: true,
      baseUrl: 'http://prowlarr.example:9696',
      options: { categories: [3030] },
      secret: 'api-key-123',
    });
  });

  it('never stores the secret in plaintext', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, { ...baseInput(), secret: 'api-key-123' }, SECRET);

    const row = db.prepare('SELECT ciphertext FROM provider_configs WHERE id = ?').get('prowlarr');
    expect(JSON.stringify(row)).not.toContain('api-key-123');
  });

  it('leaves an existing secret alone when the caller omits it', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, { ...baseInput(), secret: 'api-key-123' }, SECRET);
    setProviderConfig(db, { ...baseInput(), enabled: false }, SECRET);

    const saved = getProviderConfig(db, 'prowlarr', SECRET);
    expect(saved?.secret).toBe('api-key-123');
    expect(saved?.enabled).toBe(false);
  });

  it('clears the secret when the caller passes null explicitly', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, { ...baseInput(), secret: 'api-key-123' }, SECRET);
    setProviderConfig(db, { ...baseInput(), secret: null }, SECRET);

    expect(getProviderConfig(db, 'prowlarr', SECRET)?.secret).toBeNull();
  });

  it('reports a secret it cannot decrypt as absent rather than throwing', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, { ...baseInput(), secret: 'api-key-123' }, SECRET);

    // Exactly what rotating SESSION_SECRET does to every stored secret.
    const saved = getProviderConfig(db, 'prowlarr', 'b'.repeat(32));
    expect(saved?.secret).toBeNull();
    expect(saved?.baseUrl).toBe('http://prowlarr.example:9696');
  });

  it('degrades to empty options when the stored JSON is unusable', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, baseInput(), SECRET);
    db.prepare('UPDATE provider_configs SET options = ? WHERE id = ?').run('not json', 'prowlarr');

    expect(getProviderConfig(db, 'prowlarr', SECRET)?.options).toEqual({});
  });

  it('lists providers filtered by kind, ordered by id', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, baseInput(), SECRET);
    setProviderConfig(
      db,
      {
        id: 'qbittorrent',
        kind: 'download',
        enabled: true,
        baseUrl: 'http://qbit.example:8080',
        options: {},
      },
      SECRET,
    );
    setProviderConfig(
      db,
      { id: 'audiobookbay', kind: 'indexer', enabled: false, baseUrl: null, options: {} },
      SECRET,
    );

    expect(listProviderConfigs(db, SECRET, 'indexer').map((p) => p.id)).toEqual([
      'audiobookbay',
      'prowlarr',
    ]);
    expect(listProviderConfigs(db, SECRET, 'download').map((p) => p.id)).toEqual(['qbittorrent']);
    expect(listProviderConfigs(db, SECRET)).toHaveLength(3);
  });

  it('deletes a provider', () => {
    const db = openDatabase(':memory:');
    setProviderConfig(db, baseInput(), SECRET);
    deleteProviderConfig(db, 'prowlarr');
    expect(getProviderConfig(db, 'prowlarr', SECRET)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { getSettings, setSettings } from './settingsRepo.js';

describe('settingsRepo', () => {
  it('returns null before any settings are stored', () => {
    const db = openDatabase(':memory:');
    expect(getSettings(db)).toBeNull();
  });

  it('stores and retrieves the upstream base URL', () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://abs.example.com');
    const settings = getSettings(db);
    expect(settings?.baseUrl).toBe('https://abs.example.com');
    expect(settings?.upstream).toBe('audiobookshelf');
  });

  it('overwrites the previous value on a second call', () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://old.example.com');
    setSettings(db, 'https://new.example.com');
    expect(getSettings(db)?.baseUrl).toBe('https://new.example.com');
  });

  it('keeps settings for distinct upstreams independent', () => {
    const db = openDatabase(':memory:');
    setSettings(db, 'https://abs.example.com', 'audiobookshelf');
    setSettings(db, 'https://jelly.example.com', 'jellyfin');
    expect(getSettings(db, 'audiobookshelf')?.baseUrl).toBe('https://abs.example.com');
    expect(getSettings(db, 'jellyfin')?.baseUrl).toBe('https://jelly.example.com');
  });
});

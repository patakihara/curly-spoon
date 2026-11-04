/**
 * Each person's settings: a person with none stored reads the defaults, a change merges into what
 * is stored, and the table refuses a value no setting takes.
 */
import { DEFAULT_SETTINGS } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { readSettings, writeSettings } from './settings.js';
import { upsertUser } from './users.js';

const T0 = Date.UTC(2026, 10, 3, 8);

let db: Db;
let kara: string;
let otto: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  kara = upsertUser(db, { username: 'kara', role: 'member' }).id;
  otto = upsertUser(db, { username: 'otto', role: 'member' }).id;
});
afterEach(() => db.close());

describe('settings', () => {
  it('read as the defaults for a person who never changed one', () => {
    expect(readSettings(db, kara)).toEqual(DEFAULT_SETTINGS);
    expect(db.prepare('SELECT COUNT(*) AS n FROM user_settings').get()).toEqual({ n: 0 });
  });

  it('merge a change into what is stored, leaving the rest as it was', () => {
    writeSettings(db, kara, { theme: 'dark', autoplay: { music: false } }, T0);
    const after = writeSettings(
      db,
      kara,
      { autoplay: { spoken: false }, firstRunDone: true },
      T0 + 1,
    );

    expect(after).toEqual({
      theme: 'dark',
      autoplay: { music: false, spoken: false },
      queueStyle: 'youtube',
      firstRunDone: true,
      showEveryonesLibrary: false,
    });
    expect(readSettings(db, kara)).toEqual(after);
    expect(db.prepare('SELECT updated_at FROM user_settings').get()).toEqual({
      updated_at: T0 + 1,
    });
  });

  it('are one person’s alone', () => {
    writeSettings(db, kara, { queueStyle: 'spotify' }, T0);

    expect(readSettings(db, otto)).toEqual(DEFAULT_SETTINGS);
  });

  it('go with the person', () => {
    writeSettings(db, kara, { theme: 'light' }, T0);
    db.prepare('DELETE FROM users WHERE id = ?').run(kara);

    expect(db.prepare('SELECT COUNT(*) AS n FROM user_settings').get()).toEqual({ n: 0 });
  });

  it.each([
    ['theme', "'blue'"],
    ['queue_style', "'apple'"],
    ['autoplay_music', '2'],
    ['autoplay_spoken', '-1'],
    ['first_run_done', "'yes'"],
  ])('refuse a %s of %s', (column, value) => {
    writeSettings(db, kara, {}, T0);

    expect(() =>
      db.prepare(`UPDATE user_settings SET ${column} = ${value} WHERE user_id = ?`).run(kara),
    ).toThrow(/CHECK constraint failed/);
  });
});

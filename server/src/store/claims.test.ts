import type { MediaRef } from '@auralis/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { addClaim, claimsOf } from './claims.js';
import { openDatabase, type Db } from './connection.js';
import { writeSettings } from './settings.js';
import { upsertUser } from './users.js';

const item: MediaRef = { source: 'abs', id: 'item-1' };

let db: Db;
let ana: string;
let ben: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  ben = upsertUser(db, { username: 'ben', role: 'member' }).id;
});

describe('the record of who added what', () => {
  it('keeps each person’s claims apart, oldest first', () => {
    const other: MediaRef = { source: 'jellyfin', id: 'item-2' };
    addClaim(db, ana, other, 'added', 2_000);
    addClaim(db, ana, item, 'requested', 1_000);
    addClaim(db, ben, item, 'subscribed', 3_000);
    expect(claimsOf(db, ana)).toEqual([
      { ref: item, reason: 'requested' },
      { ref: other, reason: 'added' },
    ]);
    expect(claimsOf(db, ben)).toEqual([{ ref: item, reason: 'subscribed' }]);
  });

  it('holds one claim per person and item, the first', () => {
    addClaim(db, ana, item, 'requested', 1_000);
    addClaim(db, ana, item, 'played', 2_000);
    expect(claimsOf(db, ana)).toEqual([{ ref: item, reason: 'requested' }]);
  });

  it('goes with the person, and refuses a reason it does not know', () => {
    addClaim(db, ana, item, 'requested', 1_000);
    db.prepare('DELETE FROM users WHERE id = ?').run(ana);
    expect(claimsOf(db, ana)).toEqual([]);
    expect(() =>
      db
        .prepare(
          `INSERT INTO library_claims (user_id, source, item_id, reason, created_at)
           VALUES (?, 'abs', 'x', 'stolen', 1)`,
        )
        .run(ben),
    ).toThrow(/CHECK/);
  });

  it('adds the show-everyone setting to each person’s settings, off unless set', () => {
    writeSettings(db, ana, { theme: 'dark' }, 1_000);
    expect(db.prepare('SELECT show_everyone FROM user_settings').get()).toEqual({
      show_everyone: 0,
    });
    expect(() => db.prepare('UPDATE user_settings SET show_everyone = 2').run()).toThrow(/CHECK/);
  });
});

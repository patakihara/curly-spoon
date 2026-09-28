import { describe, expect, it } from 'vitest';
import { foldName, pickUpstreamUser } from './mapping.js';

const users = [
  { id: 'u1', username: 'Kara', admin: false },
  { id: 'u2', username: 'Élise', admin: false },
  { id: 'u3', username: 'someone', admin: false },
];

describe('[M0.sso/c] finding a person on an upstream at first link', () => {
  it('folds case and accents, so upstream display names meet directory login ids', () => {
    expect(foldName('Élise')).toBe('elise');
    expect(foldName('KARA')).toBe('kara');
  });

  it('links the one upstream user whose folded name is the login id', () => {
    expect(pickUpstreamUser(users, 'kara')).toEqual({ state: 'linked', id: 'u1' });
    expect(pickUpstreamUser(users, 'elise')).toEqual({ state: 'linked', id: 'u2' });
  });

  it('leaves the service unlinked with no match, or with two', () => {
    expect(pickUpstreamUser(users, 'nobody')).toEqual({
      state: 'unlinked',
      detail: 'no_account',
    });
    const twins = [...users, { id: 'u4', username: 'kará', admin: false }];
    expect(pickUpstreamUser(twins, 'kara')).toEqual({
      state: 'unlinked',
      detail: 'ambiguous',
    });
  });

  it('never links an upstream admin or root account, even on an exact name', () => {
    const admins = [{ id: 'a1', username: 'Sofia', admin: true }, ...users];
    expect(pickUpstreamUser(admins, 'sofia')).toEqual({ state: 'unlinked', detail: 'no_account' });
  });

  it("never links Auralis's own service accounts, auralis and auralis-admin", () => {
    const service = [
      { id: 's1', username: 'auralis', admin: false },
      { id: 's2', username: 'Auralis-Admin', admin: false },
    ];
    expect(pickUpstreamUser(service, 'auralis').state).toBe('unlinked');
    expect(pickUpstreamUser(service, 'auralis-admin').state).toBe('unlinked');
  });

  it('an admin sharing a folded name does not make an ordinary account ambiguous', () => {
    const both = [{ id: 'a1', username: 'KARA', admin: true }, ...users];
    expect(pickUpstreamUser(both, 'kara')).toEqual({ state: 'linked', id: 'u1' });
  });
});

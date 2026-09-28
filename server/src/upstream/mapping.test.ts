import { describe, expect, it } from 'vitest';
import { foldName, pickUpstreamUser } from './mapping.js';

const users = [
  { id: 'u1', username: 'Kara' },
  { id: 'u2', username: 'Élise' },
  { id: 'u3', username: 'someone' },
];

describe('[M0.sso/c] finding a person on an upstream at first link', () => {
  it('folds case and accents, so upstream display names meet directory login ids', () => {
    expect(foldName('Élise')).toBe('elise');
    expect(foldName('KARA')).toBe('kara');
  });

  it('links the one upstream user whose folded name is the login id', () => {
    expect(pickUpstreamUser('abs', users, 'kara')).toEqual({ state: 'linked', id: 'u1' });
    expect(pickUpstreamUser('abs', users, 'elise')).toEqual({ state: 'linked', id: 'u2' });
  });

  it('leaves the service unlinked with no match, or with two', () => {
    expect(pickUpstreamUser('abs', users, 'nobody')).toEqual({
      state: 'unlinked',
      detail: 'no_account',
    });
    const twins = [...users, { id: 'u4', username: 'kará' }];
    expect(pickUpstreamUser('abs', twins, 'kara')).toEqual({
      state: 'unlinked',
      detail: 'ambiguous',
    });
  });

  it('links a person to their own account even when it is an upstream admin', () => {
    const admins = [{ id: 'a1', username: 'Sofia' }, ...users];
    expect(pickUpstreamUser('jellyfin', admins, 'sofia')).toEqual({ state: 'linked', id: 'a1' });
  });

  it('leaves an Audiobookshelf root match unlinked, saying it is root', () => {
    const withRoot = [{ id: 'r1', username: 'Sofia', root: true }, ...users];
    expect(pickUpstreamUser('abs', withRoot, 'sofia')).toEqual({
      state: 'unlinked',
      detail: 'upstream_root',
    });
  });

  it('counts a root account sharing a folded name, so the match is ambiguous', () => {
    const both = [{ id: 'r1', username: 'KARA', root: true }, ...users];
    expect(pickUpstreamUser('abs', both, 'kara')).toEqual({
      state: 'unlinked',
      detail: 'ambiguous',
    });
  });

  it("never links Auralis's own accounts: auralis and auralis-admin on ABS, auralis on Jellyfin", () => {
    const service = [
      { id: 's1', username: 'auralis' },
      { id: 's2', username: 'Auralis-Admin' },
    ];
    const serviceAccount = { state: 'unlinked', detail: 'service_account' };
    expect(pickUpstreamUser('abs', service, 'auralis')).toEqual(serviceAccount);
    expect(pickUpstreamUser('abs', service, 'auralis-admin')).toEqual(serviceAccount);
    expect(pickUpstreamUser('jellyfin', service, 'auralis')).toEqual(serviceAccount);
    expect(pickUpstreamUser('jellyfin', service, 'auralis-admin')).toEqual({
      state: 'linked',
      id: 's2',
    });
  });

  it('never links a disabled account, and says so, but links the one active twin', () => {
    const disabled = [{ id: 'd1', username: 'Kara', disabled: true }, ...users.slice(1)];
    expect(pickUpstreamUser('abs', disabled, 'kara')).toEqual({
      state: 'unlinked',
      detail: 'disabled',
    });
    const twin = [...disabled, { id: 'a1', username: 'kara' }];
    expect(pickUpstreamUser('abs', twin, 'kara')).toEqual({ state: 'linked', id: 'a1' });
  });
});

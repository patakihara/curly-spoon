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
    expect(pickUpstreamUser(users, { loginId: 'kara' })).toEqual({ state: 'linked', id: 'u1' });
    expect(pickUpstreamUser(users, { loginId: 'elise' })).toEqual({ state: 'linked', id: 'u2' });
  });

  it('leaves the service unlinked with no match, or with two', () => {
    expect(pickUpstreamUser(users, { loginId: 'nobody' })).toEqual({
      state: 'unlinked',
      detail: 'no_account',
    });
    const twins = [...users, { id: 'u4', username: 'kará' }];
    expect(pickUpstreamUser(twins, { loginId: 'kara' })).toEqual({
      state: 'unlinked',
      detail: 'ambiguous',
    });
  });

  it('refuses an Audiobookshelf user already tied to another sign-on subject', () => {
    const abs = [{ id: 'u1', username: 'kara', oidcSub: 'sub-other' }];
    expect(pickUpstreamUser(abs, { loginId: 'kara', sub: 'sub-kara' })).toEqual({
      state: 'unlinked',
      detail: 'subject_mismatch',
    });
    const same = [{ id: 'u1', username: 'kara', oidcSub: 'sub-kara' }];
    expect(pickUpstreamUser(same, { loginId: 'kara', sub: 'sub-kara' })).toEqual({
      state: 'linked',
      id: 'u1',
    });
    const none = [{ id: 'u1', username: 'kara', oidcSub: null }];
    expect(pickUpstreamUser(none, { loginId: 'kara', sub: 'sub-kara' }).state).toBe('linked');
  });
});

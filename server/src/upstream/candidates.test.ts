/**
 * Which upstream accounts each provisioner offers for linking. The list calls are answered by a
 * stand-in fetch carrying only the fields the provisioners read; the full recorded answers come
 * with the sign-in recordings.
 */
import { describe, expect, it } from 'vitest';
import { AbsProvisioner } from '../adapters/audiobookshelf/provision.js';
import { JellyfinProvisioner } from '../adapters/jellyfin/quickConnect.js';

const answer = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

describe('upstream accounts offered for linking', () => {
  it('Audiobookshelf marks root and admin accounts as admin, and drops inactive ones', async () => {
    const abs = new AbsProvisioner({
      baseUrl: 'http://abs.invalid',
      provisionKey: 'k',
      fetch: answer({
        users: [
          { id: 'r', username: 'root', type: 'root', isActive: true },
          { id: 'a', username: 'Sofia', type: 'admin', isActive: true },
          { id: 'u', username: 'Kara', type: 'user', isActive: true },
          { id: 'g', username: 'Old', type: 'user', isActive: false },
        ],
      }),
    });
    expect(await abs.accounts()).toEqual([
      { id: 'r', username: 'root', admin: true },
      { id: 'a', username: 'Sofia', admin: true },
      { id: 'u', username: 'Kara', admin: false },
    ]);
  });

  it('Jellyfin marks administrators as admin, and drops disabled accounts', async () => {
    const jf = new JellyfinProvisioner({
      baseUrl: 'http://jf.invalid',
      apiKey: 'k',
      fetch: answer([
        { Id: 'a', Name: 'Sofia', Policy: { IsAdministrator: true, IsDisabled: false } },
        { Id: 'u', Name: 'Kara', Policy: { IsAdministrator: false, IsDisabled: false } },
        { Id: 'd', Name: 'Gone', Policy: { IsAdministrator: false, IsDisabled: true } },
      ]),
    });
    expect(await jf.accounts()).toEqual([
      { id: 'a', username: 'Sofia', admin: true },
      { id: 'u', username: 'Kara', admin: false },
    ]);
  });

  it('Jellyfin counts an account with no policy as an administrator, to be safe', async () => {
    const jf = new JellyfinProvisioner({
      baseUrl: 'http://jf.invalid',
      apiKey: 'k',
      fetch: answer([{ Id: 'x', Name: 'Kara' }]),
    });
    expect(await jf.accounts()).toEqual([{ id: 'x', username: 'Kara', admin: true }]);
  });
});

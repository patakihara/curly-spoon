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

describe('deleting a refused Audiobookshelf key', () => {
  const abs = (status: number, seen: string[]) =>
    new AbsProvisioner({
      baseUrl: 'http://abs.invalid',
      provisionKey: 'k',
      fetch: async (url, init) => {
        seen.push(`${init?.method} ${new URL(url).pathname}`);
        return new Response(status === 200 ? 'OK' : null, { status });
      },
    });

  it('deletes it by id, and counts one already gone as deleted', async () => {
    const seen: string[] = [];
    await abs(200, seen).revoke('key-1');
    await abs(404, seen).revoke('key-2');
    expect(seen).toEqual(['DELETE /api/api-keys/key-1', 'DELETE /api/api-keys/key-2']);
  });

  it('fails when Audiobookshelf will not delete it', async () => {
    await expect(abs(500, []).revoke('key-1')).rejects.toThrow(/answered 500/);
  });
});

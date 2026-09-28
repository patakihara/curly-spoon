/**
 * A household member with no Audiobookshelf account gets one at their first sign-in, made by
 * Auralis with the provisioning key: a plain listening user whose password nobody knows. Jellyfin
 * accounts are never created. Upstream answers come from stand-in fetches carrying only the
 * fields Auralis reads; ABS 2.36.1 `UserController.create` answers `{user}`.
 */
import { LOGIN_COOKIE } from '@auralis/schema';
import { describe, expect, it } from 'vitest';
import { AbsProvisioner } from '../adapters/audiobookshelf/provision.js';
import { type FetchLike } from '../adapters/http/fetch.js';
import { JellyfinProvisioner } from '../adapters/jellyfin/quickConnect.js';
import { buildApp } from '../app.js';
import { type Identity, type SignOn, SignOnError } from '../auth/oidc.js';
import { openDatabase } from '../store/connection.js';
import { getLink, readToken } from '../store/upstreamLinks.js';
import { getUserByUsername, upsertUser } from '../store/users.js';
import { Linker } from './links.js';

const KEY = Buffer.alloc(32, 5);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface Sent {
  call: string;
  body: Record<string, unknown> | null;
}

/** A stand-in Audiobookshelf holding `accounts`, which adds the users Auralis creates. */
function fakeAbs(accounts: { id: string; username: string; type?: string; isActive?: boolean }[]) {
  const users = accounts.map((a) => ({ type: 'user', isActive: true, ...a }));
  const sent: Sent[] = [];
  let keys = 0;
  const fetch: FetchLike = async (url, init) => {
    const { pathname } = new URL(url);
    const call = `${init?.method ?? 'GET'} ${pathname}`;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    sent.push({ call, body });
    await new Promise((resolve) => setTimeout(resolve, 3));
    if (call === 'GET /api/users') return json({ users });
    if (call === 'POST /api/users') {
      const user = { id: `abs-new-${users.length}`, username: body.username, type: body.type };
      users.push({ ...user, isActive: body.isActive });
      return json({ user: { ...user, isActive: body.isActive, token: 'old-style-token' } });
    }
    if (call === 'POST /api/api-keys') {
      keys += 1;
      return json({
        apiKey: { id: `key-${keys}`, apiKey: `abs-key-${keys}`, userId: body.userId },
      });
    }
    return new Response(null, { status: 404 });
  };
  const abs = new AbsProvisioner({ baseUrl: 'http://abs.invalid', provisionKey: 'k', fetch });
  const calls = () => sent.map((s) => s.call);
  const creates = () => sent.filter((s) => s.call === 'POST /api/users');
  return { abs, sent, calls, creates };
}

const household = { household: true };

describe('creating a missing Audiobookshelf account at first sign-in', () => {
  it('creates a listening user named by the login id, with a random password, and mints its key', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const { abs, calls, creates } = fakeAbs([{ id: 'abs-1', username: 'Otto' }]);

    await new Linker({ db, key: KEY, provisioners: [abs] }).linkAll(kara, household);

    expect(calls()).toEqual(['GET /api/users', 'POST /api/users', 'POST /api/api-keys']);
    const body = creates()[0]?.body ?? {};
    expect(body).toMatchObject({ username: 'kara', type: 'user', isActive: true });
    expect(body.permissions).toMatchObject({
      download: false,
      update: false,
      delete: false,
      upload: false,
      accessAllLibraries: true,
      accessAllTags: true,
    });
    expect(String(body.password)).toMatch(/^[A-Za-z0-9_-]{43,}$/);

    const link = getLink(db, kara.id, 'abs');
    expect(link).toMatchObject({ state: 'linked', upstreamUserId: 'abs-new-1' });
    expect(link?.createdByAuralis).toBe(true);
    expect(readToken(db, KEY, kara.id, 'abs')).toBe('abs-key-1');
  });

  it('never keeps the password it set, and sets a different one for each account', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const otto = upsertUser(db, { username: 'otto', role: 'member' });
    const { abs, creates } = fakeAbs([]);
    const linker = new Linker({ db, key: KEY, provisioners: [abs] });

    await linker.linkAll(kara, household);
    await linker.linkAll(otto, household);

    const [first, second] = creates().map((c) => String(c.body?.password));
    expect(first).not.toBe(second);
    const stored = JSON.stringify(db.prepare('SELECT * FROM upstream_links').all());
    expect(stored).not.toContain(first);
    expect(stored).not.toContain(second);
  });

  it('marks an account it only found as not created by Auralis', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const { abs, creates } = fakeAbs([{ id: 'abs-1', username: 'Kara' }]);

    await new Linker({ db, key: KEY, provisioners: [abs] }).linkAll(kara, household);

    expect(creates()).toEqual([]);
    expect(getLink(db, kara.id, 'abs')).toMatchObject({
      state: 'linked',
      upstreamUserId: 'abs-1',
      createdByAuralis: false,
    });
  });

  it('creates nothing when two accounts match the name', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const { abs, creates } = fakeAbs([
      { id: 'abs-1', username: 'Kara' },
      { id: 'abs-2', username: 'kará' },
    ]);

    await new Linker({ db, key: KEY, provisioners: [abs] }).linkAll(kara, household);

    expect(creates()).toEqual([]);
    expect(getLink(db, kara.id, 'abs')).toMatchObject({ state: 'unlinked', detail: 'ambiguous' });
  });

  it("creates nothing for a login that is one of Auralis's own service accounts", async () => {
    const db = openDatabase(':memory:');
    const service = upsertUser(db, { username: 'auralis-admin', role: 'member' });
    const { abs, creates } = fakeAbs([]);

    await new Linker({ db, key: KEY, provisioners: [abs] }).linkAll(service, household);

    expect(creates()).toEqual([]);
    expect(getLink(db, service.id, 'abs')).toMatchObject({
      state: 'unlinked',
      detail: 'service_account',
    });
  });

  it('creates nothing for a sign-in from outside the household group', async () => {
    const db = openDatabase(':memory:');
    const auralis = upsertUser(db, { username: 'recorder', role: 'member' });
    const { abs, creates } = fakeAbs([]);
    const linker = new Linker({ db, key: KEY, provisioners: [abs] });

    await linker.linkAll(auralis, { household: false });
    await linker.linkAll(auralis);

    expect(creates()).toEqual([]);
    expect(getLink(db, auralis.id, 'abs')).toMatchObject({
      state: 'unlinked',
      detail: 'no_account',
    });
  });

  it('creates nothing when the only match is a disabled account', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const { abs, creates } = fakeAbs([{ id: 'abs-1', username: 'Kara', isActive: false }]);

    await new Linker({ db, key: KEY, provisioners: [abs] }).linkAll(kara, household);

    expect(creates()).toEqual([]);
    expect(getLink(db, kara.id, 'abs')).toMatchObject({ state: 'unlinked', detail: 'disabled' });
  });

  it('creates one account for two first sign-ins by the same person at once', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const { abs, creates, calls } = fakeAbs([]);
    const linker = new Linker({ db, key: KEY, provisioners: [abs] });

    await Promise.all([linker.linkAll(kara, household), linker.linkAll(kara, household)]);

    expect(creates()).toHaveLength(1);
    expect(calls().filter((c) => c === 'POST /api/api-keys')).toHaveLength(1);
    expect(getLink(db, kara.id, 'abs')).toMatchObject({ state: 'linked', createdByAuralis: true });
  });

  it('keeps the account it created when minting fails, and mints for it next time', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const { abs, creates } = fakeAbs([]);
    const realMint = abs.mint.bind(abs);
    let failMint = true;
    abs.mint = async (id) => {
      if (failMint) throw new Error('mint failed');
      return realMint(id);
    };
    const linker = new Linker({ db, key: KEY, provisioners: [abs] });

    await linker.linkAll(kara, household);
    expect(getLink(db, kara.id, 'abs')).toMatchObject({
      state: 'error',
      upstreamUserId: 'abs-new-0',
      createdByAuralis: true,
    });

    failMint = false;
    await linker.linkAll(kara, household);
    expect(creates()).toHaveLength(1);
    expect(getLink(db, kara.id, 'abs')).toMatchObject({
      state: 'linked',
      upstreamUserId: 'abs-new-0',
      createdByAuralis: true,
    });
  });
});

describe('Jellyfin accounts are never created', () => {
  it('leaves a household member with no Jellyfin account unlinked, and sends nothing but the list', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const sent: string[] = [];
    const jellyfin = new JellyfinProvisioner({
      baseUrl: 'http://jf.invalid',
      apiKey: 'k',
      fetch: async (url, init) => {
        sent.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
        return json([{ Id: 'jf-1', Name: 'Otto', Policy: { IsDisabled: false } }]);
      },
    });

    await new Linker({ db, key: KEY, provisioners: [jellyfin] }).linkAll(kara, household);

    expect(sent).toEqual(['GET /Users']);
    expect(getLink(db, kara.id, 'jellyfin')).toMatchObject({
      state: 'unlinked',
      detail: 'no_account',
      createdByAuralis: false,
    });
  });
});

describe('the sign-in decides who may get an account created', () => {
  const people: Record<string, Identity> = {
    kara: {
      issuer: 'https://upstream.invalid',
      sub: 's-kara',
      username: 'kara',
      groups: ['household'],
    },
    rec: {
      issuer: 'https://upstream.invalid',
      sub: 's-rec',
      username: 'recorder',
      groups: ['auralis_service'],
    },
  };
  const standIn: SignOn = {
    async authorizationUrl({ state }) {
      return `https://upstream.invalid/authorize?state=${encodeURIComponent(state)}`;
    },
    async complete(code) {
      const who = people[code];
      if (who === undefined) throw new SignOnError('bad_token', 'unknown code');
      return who;
    },
  };

  it('creates for a household member, and not for the recording service account', async () => {
    const db = openDatabase(':memory:');
    const { abs, creates } = fakeAbs([]);
    const linker = new Linker({ db, key: KEY, provisioners: [abs] });
    const app = await buildApp({ webDistDir: null, db, signOn: standIn, linker });
    try {
      for (const code of ['kara', 'rec']) {
        const login = await app.inject({ url: '/auth/login' });
        const state = new URL(String(login.headers.location)).searchParams.get('state') ?? '';
        const binding = login.cookies.find((c) => c.name === LOGIN_COOKIE)?.value ?? '';
        const res = await app.inject({
          url: `/auth/callback?code=${code}&state=${encodeURIComponent(state)}`,
          headers: { cookie: `${LOGIN_COOKIE}=${binding}` },
        });
        expect(res.statusCode).toBe(302);
      }
    } finally {
      await app.close();
    }

    expect(creates().map((c) => c.body?.username)).toEqual(['kara']);
    const recorder = getUserByUsername(db, 'recorder');
    expect(getLink(db, recorder!.id, 'abs')).toMatchObject({
      state: 'unlinked',
      detail: 'no_account',
    });
  });
});

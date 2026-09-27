/**
 * Two people's upstream calls, interleaved and concurrent, each carry that person's own token and
 * never the other's. Audiobookshelf answers from its recordings; Jellyfin's are not recorded yet,
 * so its calls are answered 503 and only what Auralis sent is checked.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './adapters/http/fetch.js';
import { recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { DecryptionError } from './crypto/secretBox.js';
import { openDatabase } from './store/connection.js';
import { readToken, saveLink, type Service, UpstreamAccountTaken } from './store/upstreamLinks.js';
import { upsertUser, type User } from './store/users.js';
import { Linker, type Provisioner, upstreamFor } from './upstream/links.js';

const here = dirname(fileURLToPath(import.meta.url));
const absRecording = (call: string) =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(join(here, 'adapters', 'audiobookshelf', 'recordings', `${call}.json`), 'utf8'),
    ),
  );
const libraryList = absRecording('library-list');
const itemDetail = absRecording('item-detail');
const itemId = itemDetail.request.path.split('/').at(-1) as string;

const KEY = Buffer.alloc(32, 3);
const config = { absUrl: PLACEHOLDER_ORIGIN, jellyfinUrl: PLACEHOLDER_ORIGIN };

interface Sent {
  who: string;
  path: string;
  authorization: string;
}

/**
 * One shared log of every request, each tagged with whose client sent it. ABS answers from its
 * recordings, Jellyfin 503. Answers wait uneven moments, so the people's calls interleave.
 */
function capturing() {
  const sent: Sent[] = [];
  const replay = replayFetch([libraryList, itemDetail]);
  const fetchFor =
    (who: string): FetchLike =>
    async (url, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const { pathname } = new URL(url);
      sent.push({ who, path: pathname, authorization: headers.authorization ?? '' });
      await new Promise((resolve) => setTimeout(resolve, (sent.length * 7) % 5));
      if (pathname.startsWith('/api/')) return replay(url, init);
      return new Response(null, { status: 503 });
    };
  return { fetchFor, sent };
}

function twoLinkedPeople() {
  const db = openDatabase(':memory:');
  const kara = upsertUser(db, { username: 'kara', role: 'member' });
  const otto = upsertUser(db, { username: 'otto', role: 'member' });
  const link = (user: User, service: Service, upstreamUserId: string, token: string) =>
    saveLink(db, KEY, { userId: user.id, service, upstreamUserId, token, state: 'linked' });
  link(kara, 'abs', 'abs-kara', 'abs-token-kara');
  link(otto, 'abs', 'abs-otto', 'abs-token-otto');
  link(kara, 'jellyfin', 'jf-kara', 'jf-token-kara');
  link(otto, 'jellyfin', 'jf-otto', 'jf-token-otto');
  return { db, kara, otto };
}

describe('[M0.sso/c] upstream calls act as the person who made them', () => {
  it('carries each person’s own token on every interleaved request, never the other’s', async () => {
    const { db, kara, otto } = twoLinkedPeople();
    const { fetchFor, sent } = capturing();

    await Promise.all(
      [kara, otto].flatMap((user) => {
        const up = upstreamFor({ db, key: KEY, config, fetch: fetchFor(user.username) }, user);
        return [0, 1, 2].flatMap(() => [
          up.abs!.getLibraries(),
          up.abs!.getItem(itemId),
          up.jellyfin!.getItem('jf-item').catch(() => undefined),
        ]);
      }),
    );

    expect(sent).toHaveLength(18);
    for (const s of sent) {
      const other = s.who === 'kara' ? 'otto' : 'kara';
      expect(s.authorization).not.toContain(other);
      if (s.path.startsWith('/api/')) expect(s.authorization).toBe(`Bearer abs-token-${s.who}`);
      else expect(s.authorization).toContain(`Token="jf-token-${s.who}"`);
    }
  });

  it('gives someone with no link no client for that service', () => {
    const db = openDatabase(':memory:');
    const newcomer = upsertUser(db, { username: 'newcomer', role: 'member' });
    const up = upstreamFor(
      { db, key: KEY, config, fetch: capturing().fetchFor('newcomer') },
      newcomer,
    );
    expect(up).toEqual({ abs: null, jellyfin: null });
  });

  it('fails to decrypt a token whose ciphertext was moved to another person’s row', () => {
    const { db, kara, otto } = twoLinkedPeople();
    db.prepare(
      `UPDATE upstream_links SET token_ciphertext =
         (SELECT token_ciphertext FROM upstream_links WHERE user_id = ? AND service = 'abs')
       WHERE user_id = ? AND service = 'abs'`,
    ).run(kara.id, otto.id);
    expect(readToken(db, KEY, kara.id, 'abs')).toBe('abs-token-kara');
    expect(() => readToken(db, KEY, otto.id, 'abs')).toThrow(DecryptionError);
  });

  it('never links a second person to an upstream account someone already holds', async () => {
    const { db, otto } = twoLinkedPeople();
    expect(() =>
      saveLink(db, KEY, {
        userId: otto.id,
        service: 'abs',
        upstreamUserId: 'abs-kara',
        token: 'abs-token-otto',
        state: 'linked',
      }),
    ).toThrow(UpstreamAccountTaken);

    // The same through a linker whose name match lands on that account: nothing is minted.
    const minted: string[] = [];
    const provisioner: Provisioner = {
      service: 'abs',
      accounts: async () => [{ id: 'abs-kara', username: 'kara2' }],
      mint: async (id) => {
        minted.push(id);
        return { token: 'never' };
      },
    };
    const kara2 = upsertUser(db, { username: 'kara2', role: 'member' });
    await new Linker({ db, key: KEY, provisioners: [provisioner] }).linkAll(kara2);
    expect(minted).toEqual([]);
    expect(readToken(db, KEY, kara2.id, 'abs')).toBeNull();
  });
});

describe('[M0.sso/c] linking at sign-in', () => {
  function provisioner(service: Service, accounts: { id: string; username: string }[]) {
    const minted: string[] = [];
    let fail = false;
    const p: Provisioner = {
      service,
      accounts: async () => accounts,
      mint: async (id) => {
        if (fail) throw new Error('mint failed');
        minted.push(id);
        return { token: `${service}-token-${minted.length}`, keyId: `key-${minted.length}` };
      },
    };
    return { p, minted, failNext: () => (fail = true) };
  }

  it('pins the matched account and stores its token, and links nothing without a match', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const abs = provisioner('abs', [{ id: 'abs-1', username: 'Kara' }]);
    const jf = provisioner('jellyfin', [{ id: 'jf-1', username: 'Someone' }]);
    await new Linker({ db, key: KEY, provisioners: [abs.p, jf.p] }).linkAll(kara);
    expect(abs.minted).toEqual(['abs-1']);
    expect(readToken(db, KEY, kara.id, 'abs')).toBe('abs-token-1');
    expect(jf.minted).toEqual([]);
    expect(readToken(db, KEY, kara.id, 'jellyfin')).toBeNull();
  });

  it('stores a failure on the link instead of failing the sign-in, and retries next time', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const abs = provisioner('abs', [{ id: 'abs-1', username: 'kara' }]);
    abs.failNext();
    const linker = new Linker({ db, key: KEY, provisioners: [abs.p] });
    await expect(linker.linkAll(kara)).resolves.toBeUndefined();
    expect(readToken(db, KEY, kara.id, 'abs')).toBeNull();
  });

  it('re-mints for the pinned account when its token is refused, and retries the call once', async () => {
    const db = openDatabase(':memory:');
    const kara = upsertUser(db, { username: 'kara', role: 'member' });
    const abs = provisioner('abs', [{ id: 'abs-1', username: 'kara' }]);
    const linker = new Linker({ db, key: KEY, provisioners: [abs.p] });
    await linker.linkAll(kara);

    const replay = replayFetch([libraryList]);
    const seen: string[] = [];
    const fetch: FetchLike = async (url, init) => {
      const auth = ((init?.headers ?? {}) as Record<string, string>).authorization ?? '';
      seen.push(auth);
      return auth === 'Bearer abs-token-1'
        ? new Response(null, { status: 401 })
        : replay(url, init);
    };
    const up = upstreamFor({ db, key: KEY, config, fetch, linker }, kara);
    await expect(up.abs!.getLibraries()).resolves.toBeDefined();
    expect(seen).toEqual(['Bearer abs-token-1', 'Bearer abs-token-2']);
    expect(abs.minted).toEqual(['abs-1', 'abs-1']);
  });
});

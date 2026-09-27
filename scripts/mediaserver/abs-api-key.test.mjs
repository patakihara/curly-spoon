/**
 * The Audiobookshelf API key script, with its database read, HTTP calls and files injected.
 * Run: node --test scripts/mediaserver/abs-api-key.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { run, signAdminToken } from './abs-api-key.mjs';

const SECRET = 'a-fixed-token-secret-for-tests-0123456789';
const NOW = 1_800_000_000_000;
const KEY_FILE = '/home/test/.config/auralis/upstream-keys.env';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJrZXlJZCI6ImsxIn0.sig';

const b64url = (s) => Buffer.from(s).toString('base64url');
const decode = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/** A fake world: the ABS database, its HTTP API, the key file and the two output streams. */
function world({ keyFile, apiKeys = [], postStatus = 200 } = {}) {
  const files = new Map(keyFile === undefined ? [] : [[KEY_FILE, keyFile]]);
  const modes = new Map();
  const dirs = [];
  const requests = [];
  const out = [];
  const err = [];
  const exec = (cmd, args) => {
    assert.equal(cmd, 'sqlite3');
    assert.ok(args.includes('-readonly'), 'the database is only ever opened read-only');
    const sql = args.at(-1);
    if (/tokenSecret/.test(sql)) return JSON.stringify([{ tokenSecret: SECRET }]);
    if (/FROM users/.test(sql)) return JSON.stringify([{ id: 'root-id', username: 'admin' }]);
    throw new Error(`unexpected sql ${sql}`);
  };
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, headers: init.headers ?? {}, body });
    const path = new URL(url).pathname;
    const reply = (status, json) =>
      new Response(JSON.stringify(json), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (method === 'GET' && path === '/api/api-keys') return reply(200, { apiKeys });
    if (method === 'POST' && path === '/api/api-keys') {
      if (postStatus !== 200)
        return reply(postStatus, { error: `bad token ${init.headers.authorization}` });
      return reply(200, { apiKey: { id: 'k1', name: body.name, isActive: true, apiKey: NEW_KEY } });
    }
    if (method === 'DELETE' && path === '/api/api-keys/k1') return reply(200, {});
    if (method === 'GET' && path === '/api/libraries') {
      return reply(200, { libraries: [{ id: 'l1', name: 'Books', mediaType: 'book' }] });
    }
    return reply(404, {});
  };
  const fs = {
    readFileSync: (p) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(p);
    },
    writeFileSync: (p, data, opts) => {
      files.set(p, data);
      modes.set(p, opts?.mode);
    },
    mkdirSync: (p, opts) => dirs.push({ p, mode: opts?.mode }),
    chmodSync: (p, mode) => modes.set(p, mode),
  };
  const deps = {
    exec,
    fetch,
    fs,
    now: () => NOW,
    uuid: () => 'jti-1',
    home: '/home/test',
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  };
  return { deps, files, modes, dirs, requests, out, err };
}

test('the admin token is an HS256 JWT that verifies with the secret and expires in five minutes', () => {
  const token = signAdminToken({
    secret: SECRET,
    userId: 'root-id',
    username: 'admin',
    now: NOW,
    jti: 'jti-1',
  });
  const [header, payload, signature] = token.split('.');
  assert.deepEqual(decode(header), { alg: 'HS256', typ: 'JWT' });
  const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  assert.equal(signature, expected);
  const claims = decode(payload);
  assert.equal(claims.userId, 'root-id');
  assert.equal(claims.username, 'admin');
  assert.equal(claims.type, 'access');
  assert.equal(claims.jti, 'jti-1');
  assert.equal(claims.iat, NOW / 1000);
  assert.equal(claims.exp - claims.iat, 300);
  assert.equal(b64url(JSON.stringify(decode(header))), header);
});

test('create posts name Auralis, the root user id and isActive true, and writes the key 0600', async () => {
  const w = world({ keyFile: 'JELLYFIN_API_KEY=jf\n' });
  assert.equal(await run(['create'], w.deps), 0);
  const post = w.requests.find((r) => r.method === 'POST');
  assert.equal(post.url, 'http://127.0.0.1:13378/api/api-keys');
  assert.deepEqual(post.body, { name: 'Auralis', userId: 'root-id', isActive: true });
  assert.match(post.headers.authorization, /^Bearer eyJ/);
  assert.equal(w.files.get(KEY_FILE), `JELLYFIN_API_KEY=jf\nABS_API_KEY=${NEW_KEY}\n`);
  assert.equal(w.modes.get(KEY_FILE), 0o600);
  assert.deepEqual(w.dirs, [{ p: '/home/test/.config/auralis', mode: 0o700 }]);
  assert.deepEqual(w.out, ['created Audiobookshelf API key Auralis, id k1']);
});

test('create is the default command, and makes the key file when there is none', async () => {
  const w = world();
  assert.equal(await run([], w.deps), 0);
  assert.equal(w.files.get(KEY_FILE), `ABS_API_KEY=${NEW_KEY}\n`);
});

test('create refuses when the key file already has ABS_API_KEY or an active Auralis key exists', async () => {
  const inFile = world({ keyFile: 'ABS_API_KEY=old\n' });
  assert.equal(await run(['create'], inFile.deps), 1);
  assert.ok(!inFile.requests.some((r) => r.method === 'POST'));
  assert.match(inFile.err.join('\n'), /already has ABS_API_KEY/);

  const onServer = world({ apiKeys: [{ id: 'k0', name: 'Auralis', isActive: true }] });
  assert.equal(await run(['create'], onServer.deps), 1);
  assert.ok(!onServer.requests.some((r) => r.method === 'POST'));
  assert.match(onServer.err.join('\n'), /already has an active key named Auralis/);
  assert.equal(onServer.files.size, 0);
});

test('check reads the libraries with the stored key and expects Books', async () => {
  const w = world({ keyFile: `ABS_API_KEY=${NEW_KEY}\n` });
  assert.equal(await run(['check'], w.deps), 0);
  const [req] = w.requests;
  assert.equal(req.url, 'http://127.0.0.1:13378/api/libraries');
  assert.equal(req.headers.authorization, `Bearer ${NEW_KEY}`);
  assert.deepEqual(w.out, ['the Auralis key reads the libraries, Books included']);
});

test('revoke deletes the Auralis key and removes its line', async () => {
  const w = world({
    keyFile: `JELLYFIN_API_KEY=jf\nABS_API_KEY=${NEW_KEY}\n`,
    apiKeys: [
      { id: 'other', name: 'Another service', isActive: true },
      { id: 'k1', name: 'Auralis', isActive: true },
    ],
  });
  assert.equal(await run(['revoke'], w.deps), 0);
  const del = w.requests.filter((r) => r.method === 'DELETE');
  assert.deepEqual(
    del.map((r) => r.url),
    ['http://127.0.0.1:13378/api/api-keys/k1'],
  );
  assert.equal(w.files.get(KEY_FILE), 'JELLYFIN_API_KEY=jf\n');
  assert.equal(w.modes.get(KEY_FILE), 0o600);
});

test('the secret never reaches stdout, stderr or the key file', async () => {
  for (const w of [world(), world({ postStatus: 401 }), world({ keyFile: 'ABS_API_KEY=x\n' })]) {
    await run(['create'], w.deps).catch(() => 1);
    const everything = [...w.out, ...w.err, ...w.files.values()].join('\n');
    assert.ok(!everything.includes(SECRET), 'no tokenSecret in any output');
    const admin = w.requests.find((r) => r.method === 'POST')?.headers.authorization;
    if (admin) assert.ok(!everything.includes(admin.slice(7)), 'no admin token in any output');
  }
});

test('an unknown command is refused with the usage', async () => {
  const w = world();
  assert.equal(await run(['frobnicate'], w.deps), 2);
  assert.match(w.err.join('\n'), /create \| check \| revoke/);
});

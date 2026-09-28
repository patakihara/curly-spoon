/**
 * The Audiobookshelf API key script, with its database read, HTTP calls and files injected.
 * The fake answers what ABS 2.36.1 answers (server/controllers/{ApiKey,User,Me}Controller.js):
 * JSON bodies, or the plain text Express's `sendStatus` sends.
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

/** ABS's `getDefaultPermissionsForUserType` (server/models/User.js), without the two arrays. */
function defaultPermissions(type) {
  const elevated = type === 'root' || type === 'admin';
  return {
    download: true,
    update: elevated,
    delete: type === 'root',
    upload: elevated,
    createEreader: elevated,
    accessAllLibraries: true,
    accessAllTags: true,
    accessExplicitContent: elevated,
    selectedTagsNotAccessible: false,
  };
}

/** A user as `toOldJSONForBrowser` shows it, minimal. */
function userJson({ id, username, type, isActive = true, permissions, librariesAccessible = [] }) {
  return {
    id,
    username,
    email: null,
    type,
    token: '',
    isActive,
    isLocked: false,
    lastSeen: null,
    createdAt: NOW,
    permissions: permissions ?? defaultPermissions(type),
    librariesAccessible,
    itemTagsSelected: [],
    hasOpenIDLink: false,
  };
}

const ROOT = userJson({ id: 'root-id', username: 'admin', type: 'root' });

/** A fake world: the ABS database, its HTTP API, the key file and the two output streams. */
function world({ keyFile, keyFileMode, apiKeys = [], users = [ROOT], adminStatus = 200 } = {}) {
  const files = new Map(keyFile === undefined ? [] : [[KEY_FILE, keyFile]]);
  const modes = new Map(keyFile === undefined ? [] : [[KEY_FILE, keyFileMode ?? 0o600]]);
  const fsOps = [];
  const dirs = [];
  const requests = [];
  const out = [];
  const err = [];
  const userList = [...users];
  const keyList = [...apiKeys];
  const exec = (cmd, args) => {
    assert.equal(cmd, 'sqlite3');
    assert.ok(args.includes('-readonly'), 'the database is only ever opened read-only');
    const sql = args.at(-1);
    if (/tokenSecret/.test(sql)) return JSON.stringify([{ tokenSecret: SECRET }]);
    if (/FROM users/.test(sql)) return JSON.stringify([{ id: 'root-id', username: 'admin' }]);
    throw new Error(`unexpected sql ${sql}`);
  };
  const json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  /** Express's `res.sendStatus`: the status text as a plain-text body. */
  const sendStatus = (status) =>
    new Response({ 200: 'OK', 400: 'Bad Request', 401: 'Unauthorized', 404: 'Not Found' }[status], {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, headers: init.headers ?? {}, body });
    const path = new URL(url).pathname;
    const bearer = (init.headers?.authorization ?? '').replace(/^Bearer /, '');
    const asAdmin = bearer !== NEW_KEY;
    if (asAdmin && adminStatus !== 200) return sendStatus(adminStatus);

    if (method === 'GET' && path === '/api/api-keys') return json(200, { apiKeys: keyList });
    if (method === 'POST' && path === '/api/api-keys') {
      if (typeof body?.name !== 'string' || typeof body?.userId !== 'string')
        return sendStatus(400);
      const owner = userList.find((u) => u.id === body.userId);
      if (!owner) return sendStatus(400);
      const created = {
        id: 'k1',
        name: body.name,
        description: null,
        expiresAt: body.expiresIn ? new Date(NOW + body.expiresIn * 1000).toISOString() : null,
        lastUsedAt: null,
        isActive: !!body.isActive,
        permissions: {},
        userId: owner.id,
        createdByUserId: 'root-id',
        user: { id: owner.id, username: owner.username, type: owner.type },
      };
      keyList.push(created);
      return json(200, { apiKey: { apiKey: NEW_KEY, ...created } });
    }
    const keyMatch = /^\/api\/api-keys\/([^/]+)$/.exec(path);
    if (method === 'DELETE' && keyMatch) {
      const i = keyList.findIndex((k) => k.id === decodeURIComponent(keyMatch[1]));
      if (i < 0) return sendStatus(404);
      keyList.splice(i, 1);
      return sendStatus(200);
    }
    if (method === 'GET' && path === '/api/users') return json(200, { users: userList });
    if (method === 'POST' && path === '/api/users') {
      if (typeof body?.username !== 'string' || typeof body?.password !== 'string') {
        return new Response('Username and password are required', { status: 400 });
      }
      if (userList.some((u) => u.username === body.username)) {
        return new Response('Username already taken', { status: 400 });
      }
      const type = body.type || 'user';
      const permissions = { ...defaultPermissions(type) };
      for (const [k, v] of Object.entries(body.permissions ?? {})) {
        if (k in permissions && typeof v === 'boolean') permissions[k] = v;
      }
      const user = userJson({
        id: 'auralis-id',
        username: body.username,
        type,
        isActive: !!body.isActive,
        permissions,
      });
      userList.push(user);
      return json(200, { user });
    }
    if (method === 'GET' && path === '/api/me') {
      const key = keyList.find((k) => k.id === 'k1');
      const owner = userList.find((u) => u.id === key?.userId);
      return owner ? json(200, owner) : sendStatus(401);
    }
    if (method === 'GET' && path === '/api/libraries') {
      return json(200, { libraries: [{ id: 'l1', name: 'Books', mediaType: 'book' }] });
    }
    return sendStatus(404);
  };
  const fs = {
    readFileSync: (p) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return files.get(p);
    },
    writeFileSync: (p, data, opts) => {
      fsOps.push({ op: 'write', mode: modes.get(p) });
      if (!files.has(p)) modes.set(p, opts?.mode);
      files.set(p, data);
    },
    mkdirSync: (p, opts) => dirs.push({ p, mode: opts?.mode }),
    chmodSync: (p, mode) => {
      if (!files.has(p)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      fsOps.push({ op: 'chmod', mode });
      modes.set(p, mode);
    },
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
  return { deps, files, modes, fsOps, dirs, requests, out, err, userList, keyList };
}

const AURALIS = userJson({
  id: 'auralis-id',
  username: 'auralis',
  type: 'user',
  permissions: {
    ...defaultPermissions('user'),
    download: false,
    accessExplicitContent: true,
  },
});

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

test('create makes a non-admin auralis user that can only listen, with a random password', async () => {
  const w = world();
  assert.equal(await run(['create'], w.deps), 0);
  const post = w.requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/users'));
  assert.equal(post.url, 'http://127.0.0.1:13378/api/users');
  const { password, ...rest } = post.body;
  assert.equal(typeof password, 'string');
  assert.ok(password.length >= 32, 'the password is long and random');
  assert.deepEqual(rest, {
    username: 'auralis',
    type: 'user',
    isActive: true,
    permissions: {
      download: false,
      update: false,
      delete: false,
      upload: false,
      createEreader: false,
      accessAllLibraries: true,
      accessAllTags: true,
      accessExplicitContent: true,
      selectedTagsNotAccessible: false,
    },
  });
  const made = w.userList.find((u) => u.username === 'auralis');
  assert.equal(made.type, 'user');
  assert.equal(made.isActive, true);
  const everything = [...w.out, ...w.err, ...w.files.values()].join('\n');
  assert.ok(!everything.includes(password), 'the password is never printed or stored');
});

test('create posts the Auralis key for the auralis user, with no expiry, and writes it 0600', async () => {
  const w = world({ keyFile: 'JELLYFIN_API_KEY=jf\n' });
  assert.equal(await run(['create'], w.deps), 0);
  const post = w.requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/api-keys'));
  assert.equal(post.url, 'http://127.0.0.1:13378/api/api-keys');
  assert.deepEqual(post.body, { name: 'Auralis', userId: 'auralis-id', isActive: true });
  assert.match(post.headers.authorization, /^Bearer eyJ/);
  assert.equal(w.keyList.at(-1).expiresAt, null);
  assert.equal(w.files.get(KEY_FILE), `JELLYFIN_API_KEY=jf\nABS_API_KEY=${NEW_KEY}\n`);
  assert.equal(w.modes.get(KEY_FILE), 0o600);
  assert.deepEqual(w.dirs, [{ p: '/home/test/.config/auralis', mode: 0o700 }]);
  assert.deepEqual(w.out, [
    'created Audiobookshelf user auralis, id auralis-id',
    'created Audiobookshelf API key Auralis for auralis, id k1',
  ]);
});

test('create reuses an auralis user that already exists', async () => {
  const w = world({ users: [ROOT, AURALIS] });
  assert.equal(await run(['create'], w.deps), 0);
  assert.ok(!w.requests.some((r) => r.method === 'POST' && r.url.endsWith('/api/users')));
  const post = w.requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/api-keys'));
  assert.equal(post.body.userId, 'auralis-id');
  assert.equal(w.out[0], 'using the existing Audiobookshelf user auralis, id auralis-id');
});

test('create refuses an existing auralis user that is an admin or may change the library', async () => {
  for (const user of [
    { ...AURALIS, type: 'admin' },
    { ...AURALIS, permissions: { ...AURALIS.permissions, delete: true } },
    { ...AURALIS, isActive: false },
  ]) {
    const w = world({ users: [ROOT, user] });
    assert.equal(await run(['create'], w.deps), 1);
    assert.ok(!w.requests.some((r) => r.method === 'POST'), 'nothing is created');
    assert.match(w.err.join('\n'), /user auralis exists but/);
  }
});

test('create is the default command, and makes the key file when there is none', async () => {
  const w = world();
  assert.equal(await run([], w.deps), 0);
  assert.equal(w.files.get(KEY_FILE), `ABS_API_KEY=${NEW_KEY}\n`);
});

test('create tightens a key file with a loose mode before writing the key into it', async () => {
  const w = world({ keyFile: 'JELLYFIN_API_KEY=jf\n', keyFileMode: 0o644 });
  assert.equal(await run(['create'], w.deps), 0);
  assert.deepEqual(w.fsOps[0], { op: 'chmod', mode: 0o600 });
  const firstWrite = w.fsOps.find((o) => o.op === 'write');
  assert.equal(firstWrite.mode, 0o600, 'the file is 0600 before the key is written');
  assert.equal(w.modes.get(KEY_FILE), 0o600);
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

test('create explains a 401: the server signs with JWT_SECRET_KEY, not its tokenSecret', async () => {
  const w = world({ adminStatus: 401 });
  assert.equal(await run(['create'], w.deps), 1);
  assert.match(w.err.join('\n'), /refused the signed admin token \(401\).*JWT_SECRET_KEY/);
  assert.equal(w.files.size, 0);
});

test('check confirms the key authenticates as auralis, not an admin, and reads Books', async () => {
  const w = world({
    keyFile: `ABS_API_KEY=${NEW_KEY}\n`,
    users: [ROOT, AURALIS],
    apiKeys: [{ id: 'k1', name: 'Auralis', isActive: true, userId: 'auralis-id' }],
  });
  assert.equal(await run(['check'], w.deps), 0);
  assert.deepEqual(
    w.requests.map((r) => [r.url, r.headers.authorization]),
    [
      ['http://127.0.0.1:13378/api/me', `Bearer ${NEW_KEY}`],
      ['http://127.0.0.1:13378/api/libraries', `Bearer ${NEW_KEY}`],
    ],
  );
  assert.deepEqual(w.out, [
    'the Auralis key authenticates as auralis, a user that is not an admin, and reads Books',
  ]);
});

test('check fails when the key authenticates as someone else or as an admin', async () => {
  for (const owner of [ROOT, { ...AURALIS, type: 'admin' }]) {
    const w = world({
      keyFile: `ABS_API_KEY=${NEW_KEY}\n`,
      users: [owner],
      apiKeys: [{ id: 'k1', name: 'Auralis', isActive: true, userId: owner.id }],
    });
    assert.equal(await run(['check'], w.deps), 1);
    assert.match(w.err.join('\n'), /authenticates as/);
  }
});

test('revoke deletes the Auralis key, which ABS answers with a plain-text OK, and removes its line', async () => {
  const w = world({
    keyFile: `JELLYFIN_API_KEY=jf\nABS_API_KEY=${NEW_KEY}\n`,
    users: [ROOT, AURALIS],
    apiKeys: [
      { id: 'other', name: 'Another service', isActive: true },
      { id: 'k1', name: 'Auralis', isActive: true },
    ],
  });
  assert.equal(await run(['revoke'], w.deps), 0, w.err.join('\n'));
  const del = w.requests.filter((r) => r.method === 'DELETE');
  assert.deepEqual(
    del.map((r) => r.url),
    ['http://127.0.0.1:13378/api/api-keys/k1'],
  );
  assert.deepEqual(
    w.keyList.map((k) => k.id),
    ['other'],
  );
  assert.equal(w.files.get(KEY_FILE), 'JELLYFIN_API_KEY=jf\n');
  assert.equal(w.modes.get(KEY_FILE), 0o600);
  assert.ok(
    w.userList.some((u) => u.username === 'auralis'),
    'the user stays',
  );
});

test('the secret never reaches stdout, stderr or the key file', async () => {
  for (const w of [world(), world({ adminStatus: 401 }), world({ keyFile: 'ABS_API_KEY=x\n' })]) {
    await run(['create'], w.deps).catch(() => 1);
    const everything = [...w.out, ...w.err, ...w.files.values()].join('\n');
    assert.ok(!everything.includes(SECRET), 'no tokenSecret in any output');
    const admin = w.requests.find((r) => r.method === 'GET')?.headers.authorization;
    if (admin) assert.ok(!everything.includes(admin.slice(7)), 'no admin token in any output');
  }
});

test('--help says revoke leaves the auralis user in place', async () => {
  const w = world();
  assert.equal(await run(['--help'], w.deps), 0);
  assert.match(w.out.join('\n'), /revoke.*leaves the auralis user/s);
  assert.equal(w.requests.length, 0);
});

test('an unknown command is refused with the usage', async () => {
  const w = world();
  assert.equal(await run(['frobnicate'], w.deps), 2);
  assert.match(w.err.join('\n'), /create \| check \| revoke/);
  assert.match(w.err.join('\n'), /provision \| check-provision \| revoke-provision/);
});

const ADMIN = userJson({
  id: 'auralis-admin-id',
  username: 'auralis-admin',
  type: 'admin',
  permissions: { ...defaultPermissions('admin'), accessAllLibraries: false },
});

test('[M0.sso/c] provision makes an admin, not root, that may touch no library', async () => {
  const w = world();
  assert.equal(await run(['provision'], w.deps), 0);
  const post = w.requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/users'));
  const { password, ...rest } = post.body;
  assert.equal(typeof password, 'string');
  assert.ok(password.length >= 32);
  assert.deepEqual(rest, {
    username: 'auralis-admin',
    type: 'admin',
    isActive: true,
    permissions: {
      download: false,
      update: false,
      delete: false,
      upload: false,
      createEreader: false,
      accessAllLibraries: false,
      accessAllTags: false,
      accessExplicitContent: false,
      selectedTagsNotAccessible: false,
    },
  });
  const made = w.userList.find((u) => u.username === 'auralis-admin');
  assert.equal(made.type, 'admin');
});

test('[M0.sso/c] provision mints the Auralis provisioning key and writes ABS_PROVISION_KEY 0600, beside the other keys', async () => {
  const w = world({ keyFile: `ABS_API_KEY=listen\nJELLYFIN_API_KEY=jf\n` });
  assert.equal(await run(['provision'], w.deps), 0);
  const post = w.requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/api-keys'));
  assert.deepEqual(post.body, {
    name: 'Auralis provisioning',
    userId: 'auralis-id',
    isActive: true,
  });
  assert.match(post.headers.authorization, /^Bearer eyJ/);
  assert.equal(w.keyList.at(-1).expiresAt, null);
  assert.equal(
    w.files.get(KEY_FILE),
    `ABS_API_KEY=listen\nJELLYFIN_API_KEY=jf\nABS_PROVISION_KEY=${NEW_KEY}\n`,
  );
  assert.equal(w.modes.get(KEY_FILE), 0o600);
  assert.ok(![...w.out, ...w.err].join('\n').includes(NEW_KEY), 'the key is never printed');
});

test('[M0.sso/c] provision reuses an existing admin auralis-admin, and refuses a root or user one', async () => {
  const reuse = world({ users: [ROOT, ADMIN] });
  assert.equal(await run(['provision'], reuse.deps), 0);
  assert.ok(!reuse.requests.some((r) => r.method === 'POST' && r.url.endsWith('/api/users')));
  const post = reuse.requests.find((r) => r.method === 'POST' && r.url.endsWith('/api/api-keys'));
  assert.equal(post.body.userId, 'auralis-admin-id');

  for (const type of ['root', 'user']) {
    const other = userJson({ id: 'x', username: 'auralis-admin', type });
    const w = world({ users: [ROOT, other] });
    assert.equal(await run(['provision'], w.deps), 1);
    assert.match(w.err.join('\n'), new RegExp(`auralis-admin exists but is of type ${type}`));
    assert.ok(!w.requests.some((r) => r.method === 'POST' && r.url.endsWith('/api/api-keys')));
  }
});

test('[M0.sso/c] provision refuses to reuse an auralis-admin that can reach a library', async () => {
  const cases = [
    { permissions: defaultPermissions('admin') },
    {
      permissions: { ...defaultPermissions('admin'), accessAllLibraries: false },
      librariesAccessible: ['l1'],
    },
  ];
  for (const extra of cases) {
    const other = userJson({ id: 'x', username: 'auralis-admin', type: 'admin', ...extra });
    const w = world({ users: [ROOT, other] });
    assert.equal(await run(['provision'], w.deps), 1);
    assert.match(w.err.join('\n'), /auralis-admin exists but can reach a library/);
    assert.ok(!w.requests.some((r) => r.method === 'POST' && r.url.endsWith('/api/api-keys')));
  }
});

test('[M0.sso/c] provision refuses when the key file or ABS already holds a provisioning key', async () => {
  const inFile = world({ keyFile: 'ABS_PROVISION_KEY=old\n' });
  assert.equal(await run(['provision'], inFile.deps), 1);
  assert.match(inFile.err.join('\n'), /already has ABS_PROVISION_KEY/);
  const onServer = world({
    apiKeys: [{ id: 'k0', name: 'Auralis provisioning', isActive: true }],
  });
  assert.equal(await run(['provision'], onServer.deps), 1);
  assert.match(onServer.err.join('\n'), /active key named Auralis provisioning/);
});

test('[M0.sso/c] check-provision confirms the key is auralis-admin, an admin that can list users', async () => {
  const w = world({ keyFile: `ABS_PROVISION_KEY=${NEW_KEY}\n`, users: [ROOT, ADMIN] });
  w.keyList.push({ id: 'k1', name: 'Auralis provisioning', userId: 'auralis-admin-id' });
  assert.equal(await run(['check-provision'], w.deps), 0);
  assert.deepEqual(
    w.requests.map((r) => [r.url, r.headers.authorization]),
    [
      ['http://127.0.0.1:13378/api/me', `Bearer ${NEW_KEY}`],
      ['http://127.0.0.1:13378/api/users', `Bearer ${NEW_KEY}`],
    ],
  );

  const wrong = world({ keyFile: `ABS_PROVISION_KEY=${NEW_KEY}\n`, users: [ROOT, AURALIS] });
  wrong.keyList.push({ id: 'k1', name: 'Auralis provisioning', userId: 'auralis-id' });
  assert.equal(await run(['check-provision'], wrong.deps), 1);
  assert.match(wrong.err.join('\n'), /not as the admin auralis-admin/);
});

test('[M0.sso/c] revoke-provision deletes only the provisioning key and its line', async () => {
  const w = world({
    keyFile: `ABS_API_KEY=listen\nABS_PROVISION_KEY=${NEW_KEY}\n`,
    apiKeys: [
      { id: 'k0', name: 'Auralis', isActive: true },
      { id: 'k9', name: 'Auralis provisioning', isActive: true },
    ],
  });
  assert.equal(await run(['revoke-provision'], w.deps), 0);
  assert.deepEqual(
    w.keyList.map((k) => k.id),
    ['k0'],
  );
  assert.equal(w.files.get(KEY_FILE), 'ABS_API_KEY=listen\n');
});

/**
 * Creates, checks or revokes Auralis's two Audiobookshelf API keys, on mediaserver, through
 * ABS's own API. Node 20, no dependencies, holds no secret. From the repo on the laptop:
 *
 *   ssh mediaserver node --input-type=module - [command|--help] < scripts/mediaserver/abs-api-key.mjs
 *
 * The key belongs to a dedicated ABS user, `auralis`: type `user`, all libraries, no update,
 * delete, upload or download permission. Its password is random and never stored; nobody logs in
 * as it. ABS 2.36.1 has no separate stream permission: any active user who can reach a library
 * can play from it.
 *
 * `create` (the default) authorises its admin calls with a five-minute root token it signs with
 * the server's `tokenSecret`, read with `sqlite3 -readonly` (the same token
 * `TokenManager.generateTempAccessToken` makes). It makes or reuses the `auralis` user
 * (`POST /api/users`), then creates the key `Auralis` for it with no expiry (`POST /api/api-keys`
 * takes a `userId`). ABS writes its own rows; nothing is written to its database by hand and
 * nothing restarts. The key goes to the key file (0600, in a 0700 folder); only ids are printed.
 * The secret, the admin token and the password are never printed, stored or sent anywhere but
 * 127.0.0.1.
 *
 * `provision`, `check-provision` and `revoke-provision` do the same for the provisioning key:
 * `Auralis provisioning`, on a dedicated ABS account `auralis-admin` of type admin (never root,
 * so it can never mint a root user's key) that may touch no library. Auralis uses it only to list
 * users and mint each person's own key at their first sign-in. It goes to the same key file as
 * `ABS_PROVISION_KEY`.
 */
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ABS = 'http://127.0.0.1:13378';
const TOKEN_SECONDS = 300;
const USAGE =
  'usage: abs-api-key.mjs [create | check | revoke | provision | check-provision | revoke-provision | --help]';
const HELP = `${USAGE}

  create             make or reuse the ABS user auralis (not an admin; it can only listen),
                     create the API key Auralis for it with no expiry, and write ABS_API_KEY
                     to the key file
  check              confirm the stored key authenticates as auralis, not an admin, and reads
                     Books
  revoke             delete the key Auralis and its ABS_API_KEY line; it leaves the auralis user
                     in place (delete it in ABS, Settings, Users, if it is no longer wanted)
  provision          make or reuse the ABS admin auralis-admin (not root; no library), create the
                     API key Auralis provisioning for it with no expiry, and write
                     ABS_PROVISION_KEY to the key file
  check-provision    confirm the stored provisioning key is auralis-admin, an admin that can list
                     users
  revoke-provision   delete the key Auralis provisioning and its ABS_PROVISION_KEY line; it
                     leaves the auralis-admin user in place`;

/**
 * The `auralis` user's permissions, as `POST /api/users` takes them (ABS 2.36.1,
 * `User.getDefaultPermissionsForUserType`). Explicit content stays visible so no book silently
 * drops out of Auralis.
 */
export const AURALIS_PERMISSIONS = {
  download: false,
  update: false,
  delete: false,
  upload: false,
  createEreader: false,
  accessAllLibraries: true,
  accessAllTags: true,
  accessExplicitContent: true,
  selectedTagsNotAccessible: false,
};

/**
 * The provisioning account's permissions: an admin by type, which is all minting needs, with
 * nothing on any library.
 */
export const PROVISIONING_PERMISSIONS = {
  download: false,
  update: false,
  delete: false,
  upload: false,
  createEreader: false,
  accessAllLibraries: false,
  accessAllTags: false,
  accessExplicitContent: false,
  selectedTagsNotAccessible: false,
};

/** Why an existing `auralis` user cannot hold the listening key, or undefined when it can. */
function unfitListener(user) {
  if (user.type !== 'user') return `is of type ${user.type}, not user`;
  if (!user.isActive) return 'is not active';
  const p = user.permissions ?? {};
  const extra = ['update', 'delete', 'upload', 'download'].filter((k) => p[k] !== false);
  if (extra.length > 0) return `may ${extra.join(', ')}`;
  if (p.accessAllLibraries !== true) return 'cannot reach every library';
  return undefined;
}

/** Why an existing `auralis-admin` cannot hold the provisioning key, or undefined when it can. */
function unfitProvisioner(user) {
  if (user.type !== 'admin') return `is of type ${user.type}, not admin`;
  if (!user.isActive) return 'is not active';
  const reach = user.librariesAccessible ?? [];
  if (user.permissions?.accessAllLibraries !== false || !Array.isArray(reach) || reach.length > 0) {
    return 'can reach a library';
  }
  return undefined;
}

/** The two keys: which account holds each, what it may do, and its line in the key file. */
const LISTEN = {
  name: 'Auralis',
  username: 'auralis',
  type: 'user',
  line: 'ABS_API_KEY',
  permissions: AURALIS_PERMISSIONS,
  unfit: unfitListener,
};
const PROVISION = {
  name: 'Auralis provisioning',
  username: 'auralis-admin',
  type: 'admin',
  line: 'ABS_PROVISION_KEY',
  permissions: PROVISIONING_PERMISSIONS,
  unfit: unfitProvisioner,
};

const b64url = (value) => Buffer.from(value).toString('base64url');

/** An HS256 JWT `{userId, username, jti, type: 'access', iat, exp: iat + 300}`. */
export function signAdminToken({ secret, userId, username, now, jti }) {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ userId, username, jti, type: 'access', iat, exp: iat + TOKEN_SECONDS }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

class Refusal extends Error {}

function paths(home) {
  return {
    db: join(home, 'docker/arr/audiobookshelf-config/absdatabase.sqlite'),
    keyFile: join(home, '.config/auralis/upstream-keys.env'),
  };
}

function query(deps, db, sql) {
  const rows = JSON.parse(deps.exec('sqlite3', ['-readonly', '-json', db, sql]) || '[]');
  if (!Array.isArray(rows) || rows.length === 0) throw new Refusal(`no row for: ${sql}`);
  return rows[0];
}

function readKeyFile(deps, file) {
  try {
    return deps.fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

/** Tightens an existing file to 0600 before the key is written into it. */
function writeKeyFile(deps, file, text) {
  deps.fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try {
    deps.fs.chmodSync(file, 0o600);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  deps.fs.writeFileSync(file, text, { mode: 0o600 });
  deps.fs.chmodSync(file, 0o600);
}

function storedKey(text, lineName) {
  const line = text.split('\n').find((l) => l.startsWith(`${lineName}=`));
  return line?.slice(lineName.length + 1).trim() || undefined;
}

/**
 * Calls ABS on 127.0.0.1 and resolves to the JSON body, or `undefined` for any other body (ABS
 * answers a delete with a plain-text `OK`). A failure names the call and status only, never a
 * header or body. With `admin`, a 401 is explained.
 */
async function abs(deps, method, path, token, { body, admin = false } = {}) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await deps.fetch(`${ABS}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (admin && res.status === 401) {
    throw new Refusal(
      `Audiobookshelf refused the signed admin token (401). It signs with JWT_SECRET_KEY when ` +
        `that is set in its container, not with the tokenSecret setting this script reads, so ` +
        `this script cannot work there; create the key in the ABS web UI instead`,
    );
  }
  if (!res.ok) throw new Refusal(`${method} ${path} answered ${res.status}`);
  const text = await res.text();
  if (!/json/i.test(res.headers.get('content-type') ?? '')) return undefined;
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    throw new Refusal(`${method} ${path} answered JSON that does not parse`);
  }
}

const asAdmin = (deps, method, path, token, body) =>
  abs(deps, method, path, token, { body, admin: true });

function adminToken(deps, db) {
  const { tokenSecret } = query(
    deps,
    db,
    "SELECT json_extract(value, '$.tokenSecret') AS tokenSecret FROM settings WHERE key = 'server-settings'",
  );
  const { id, username } = query(
    deps,
    db,
    "SELECT id, username FROM users WHERE type = 'root' LIMIT 1",
  );
  if (typeof tokenSecret !== 'string' || !tokenSecret)
    throw new Refusal('the server has no tokenSecret');
  return signAdminToken({
    secret: tokenSecret,
    userId: id,
    username,
    now: deps.now(),
    jti: deps.uuid(),
  });
}

function apiKeys(response) {
  if (!Array.isArray(response?.apiKeys))
    throw new Refusal('GET /api/api-keys gave no apiKeys list');
  return response.apiKeys;
}

async function accountFor(deps, token, spec) {
  const { users } = (await asAdmin(deps, 'GET', '/api/users', token)) ?? {};
  if (!Array.isArray(users)) throw new Refusal('GET /api/users gave no users list');
  const existing = users.find((u) => u?.username === spec.username);
  if (existing) {
    const why = spec.unfit(existing);
    if (why) {
      throw new Refusal(
        `the Audiobookshelf user ${spec.username} exists but ${why}; fix or delete it in ABS first`,
      );
    }
    deps.out(`using the existing Audiobookshelf user ${spec.username}, id ${existing.id}`);
    return existing;
  }
  const created = await asAdmin(deps, 'POST', '/api/users', token, {
    username: spec.username,
    password: randomBytes(32).toString('base64url'),
    type: spec.type,
    isActive: true,
    permissions: spec.permissions,
  });
  const user = created?.user;
  if (typeof user?.id !== 'string' || user.type !== spec.type) {
    throw new Refusal('POST /api/users gave no user');
  }
  deps.out(`created Audiobookshelf user ${spec.username}, id ${user.id}`);
  return user;
}

async function create(deps, spec) {
  const { db, keyFile } = paths(deps.home);
  const existing = readKeyFile(deps, keyFile);
  if (storedKey(existing, spec.line)) {
    throw new Refusal(`the key file already has ${spec.line}; run revoke first`);
  }
  const token = adminToken(deps, db);
  const keys = apiKeys(await asAdmin(deps, 'GET', '/api/api-keys', token));
  if (keys.some((k) => k?.name === spec.name && k?.isActive)) {
    throw new Refusal(
      `Audiobookshelf already has an active key named ${spec.name}; run revoke first`,
    );
  }
  const user = await accountFor(deps, token, spec);
  // No expiresIn: the key never expires.
  const created = await asAdmin(deps, 'POST', '/api/api-keys', token, {
    name: spec.name,
    userId: user.id,
    isActive: true,
  });
  const key = created?.apiKey;
  if (typeof key?.apiKey !== 'string' || typeof key?.id !== 'string') {
    throw new Refusal('POST /api/api-keys gave no key');
  }
  const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing;
  writeKeyFile(deps, keyFile, `${prefix}${spec.line}=${key.apiKey}\n`);
  deps.out(`created Audiobookshelf API key ${spec.name} for ${spec.username}, id ${key.id}`);
}

function stored(deps, spec) {
  const { keyFile } = paths(deps.home);
  const key = storedKey(readKeyFile(deps, keyFile), spec.line);
  if (!key) throw new Refusal(`the key file has no ${spec.line}`);
  return key;
}

async function check(deps) {
  const key = stored(deps, LISTEN);
  const me = await abs(deps, 'GET', '/api/me', key);
  if (me?.username !== LISTEN.username || me?.type !== 'user') {
    throw new Refusal(
      `the key authenticates as ${me?.username ?? 'nobody'} (${me?.type ?? 'no type'}), not as the user ${LISTEN.username}`,
    );
  }
  const { libraries } = (await abs(deps, 'GET', '/api/libraries', key)) ?? {};
  if (!Array.isArray(libraries) || !libraries.some((l) => l?.name === 'Books')) {
    throw new Refusal('the libraries answered without Books');
  }
  deps.out(
    `the ${LISTEN.name} key authenticates as ${LISTEN.username}, a user that is not an admin, and reads Books`,
  );
}

async function checkProvision(deps) {
  const key = stored(deps, PROVISION);
  const me = await abs(deps, 'GET', '/api/me', key);
  if (me?.username !== PROVISION.username || me?.type !== 'admin') {
    throw new Refusal(
      `the key authenticates as ${me?.username ?? 'nobody'} (${me?.type ?? 'no type'}), not as the admin ${PROVISION.username}`,
    );
  }
  const { users } = (await abs(deps, 'GET', '/api/users', key)) ?? {};
  if (!Array.isArray(users)) throw new Refusal('the key cannot list users');
  deps.out(
    `the ${PROVISION.name} key authenticates as ${PROVISION.username}, an admin that is not root, and lists users`,
  );
}

async function revoke(deps, spec) {
  const { db, keyFile } = paths(deps.home);
  const token = adminToken(deps, db);
  const ours = apiKeys(await asAdmin(deps, 'GET', '/api/api-keys', token)).filter(
    (k) => k?.name === spec.name,
  );
  for (const k of ours) {
    await asAdmin(deps, 'DELETE', `/api/api-keys/${encodeURIComponent(k.id)}`, token);
    deps.out(`deleted Audiobookshelf API key ${spec.name}, id ${k.id}`);
  }
  const text = readKeyFile(deps, keyFile);
  if (storedKey(text, spec.line)) {
    const kept = text.split('\n').filter((l) => !l.startsWith(`${spec.line}=`));
    writeKeyFile(deps, keyFile, kept.join('\n'));
  }
}

const COMMANDS = {
  create: (deps) => create(deps, LISTEN),
  check,
  revoke: (deps) => revoke(deps, LISTEN),
  provision: (deps) => create(deps, PROVISION),
  'check-provision': checkProvision,
  'revoke-provision': (deps) => revoke(deps, PROVISION),
};

/** Runs one command; resolves to the exit code. */
export async function run(args, deps) {
  const name = args[0] ?? 'create';
  if (args.length === 1 && (name === '--help' || name === 'help')) {
    deps.out(HELP);
    return 0;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command || args.length > 1) {
    deps.err(USAGE);
    return 2;
  }
  try {
    await command(deps);
    return 0;
  } catch (error) {
    if (error instanceof Refusal) {
      deps.err(`${name}: ${error.message}`);
      return 1;
    }
    deps.err(`${name}: failed (${error?.name ?? 'error'})`);
    return 1;
  }
}

const self = fileURLToPath(import.meta.url);
const runAsFile = process.argv[1] !== undefined && resolve(process.argv[1]) === self;
if (runAsFile || !self.endsWith('abs-api-key.mjs')) {
  const args = process.argv.slice(runAsFile ? 2 : 1).filter((a) => a !== '-');
  process.umask(0o077);
  process.exitCode = await run(args, {
    exec: (cmd, cmdArgs) => execFileSync(cmd, cmdArgs, { encoding: 'utf8' }),
    fetch: (url, init) => fetch(url, init),
    fs: nodeFs,
    now: () => Date.now(),
    uuid: () => randomUUID(),
    home: homedir(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}

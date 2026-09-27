/**
 * Creates, checks or revokes Auralis's own Audiobookshelf API key, on mediaserver, through
 * ABS's own API. Node 20, no dependencies, holds no secret. From the repo on the laptop:
 *
 *   ssh mediaserver node --input-type=module - [create|check|revoke] < scripts/mediaserver/abs-api-key.mjs
 *
 * `create` (the default) authorises one `POST /api/api-keys` with a five-minute admin token it
 * signs with the server's `tokenSecret`, read with `sqlite3 -readonly` (the same token
 * `TokenManager.generateTempAccessToken` makes). ABS creates the row itself; nothing is written
 * to its database by hand and nothing restarts. The new key goes to the key file (0600, in a
 * 0700 folder); only its id is printed. The secret and the admin token are never printed,
 * stored or sent anywhere but 127.0.0.1.
 *
 * `check` reads the libraries with the stored key. `revoke` deletes the key named Auralis and
 * its line in the key file.
 */
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ABS = 'http://127.0.0.1:13378';
const NAME = 'Auralis';
const LINE = 'ABS_API_KEY';
const TOKEN_SECONDS = 300;
const USAGE = 'usage: abs-api-key.mjs [create | check | revoke]';

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

function writeKeyFile(deps, file, text) {
  deps.fs.mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  deps.fs.writeFileSync(file, text, { mode: 0o600 });
  deps.fs.chmodSync(file, 0o600);
}

function storedKey(text) {
  const line = text.split('\n').find((l) => l.startsWith(`${LINE}=`));
  return line?.slice(LINE.length + 1).trim() || undefined;
}

/** Calls ABS on 127.0.0.1. A failure names the call and status only, never a header or body. */
async function abs(deps, method, path, token, body) {
  const headers = { accept: 'application/json', authorization: `Bearer ${token}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await deps.fetch(`${ABS}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Refusal(`${method} ${path} answered ${res.status}`);
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Refusal(`${method} ${path} answered something that is not JSON`);
  }
}

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

async function create(deps) {
  const { db, keyFile } = paths(deps.home);
  const existing = readKeyFile(deps, keyFile);
  if (storedKey(existing)) throw new Refusal(`the key file already has ${LINE}; run revoke first`);
  const token = adminToken(deps, db);
  const keys = apiKeys(await abs(deps, 'GET', '/api/api-keys', token));
  if (keys.some((k) => k?.name === NAME && k?.isActive)) {
    throw new Refusal(`Audiobookshelf already has an active key named ${NAME}; run revoke first`);
  }
  const { id: userId } = query(
    deps,
    db,
    "SELECT id, username FROM users WHERE type = 'root' LIMIT 1",
  );
  const created = await abs(deps, 'POST', '/api/api-keys', token, {
    name: NAME,
    userId,
    isActive: true,
  });
  const key = created?.apiKey;
  if (typeof key?.apiKey !== 'string' || typeof key?.id !== 'string') {
    throw new Refusal('POST /api/api-keys gave no key');
  }
  const prefix = existing && !existing.endsWith('\n') ? `${existing}\n` : existing;
  writeKeyFile(deps, keyFile, `${prefix}${LINE}=${key.apiKey}\n`);
  deps.out(`created Audiobookshelf API key ${NAME}, id ${key.id}`);
}

async function check(deps) {
  const { keyFile } = paths(deps.home);
  const key = storedKey(readKeyFile(deps, keyFile));
  if (!key) throw new Refusal(`the key file has no ${LINE}`);
  const { libraries } = await abs(deps, 'GET', '/api/libraries', key);
  if (!Array.isArray(libraries) || !libraries.some((l) => l?.name === 'Books')) {
    throw new Refusal('the libraries answered without Books');
  }
  deps.out(`the ${NAME} key reads the libraries, Books included`);
}

async function revoke(deps) {
  const { db, keyFile } = paths(deps.home);
  const token = adminToken(deps, db);
  const ours = apiKeys(await abs(deps, 'GET', '/api/api-keys', token)).filter(
    (k) => k?.name === NAME,
  );
  for (const k of ours) {
    await abs(deps, 'DELETE', `/api/api-keys/${encodeURIComponent(k.id)}`, token);
    deps.out(`deleted Audiobookshelf API key ${NAME}, id ${k.id}`);
  }
  const text = readKeyFile(deps, keyFile);
  if (storedKey(text)) {
    const kept = text.split('\n').filter((l) => !l.startsWith(`${LINE}=`));
    writeKeyFile(deps, keyFile, kept.join('\n'));
  }
}

const COMMANDS = { create, check, revoke };

/** Runs one command; resolves to the exit code. */
export async function run(args, deps) {
  const name = args[0] ?? 'create';
  const command = COMMANDS[name];
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

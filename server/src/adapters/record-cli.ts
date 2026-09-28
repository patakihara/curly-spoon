/**
 * Record mode's entry point. Runs on the laptop against mediaserver over Tailscale; the keys
 * come on stdin from mediaserver's key file, and the URLs are typed on the command line, so
 * neither is ever written here:
 *
 *   ssh mediaserver cat .config/auralis/upstream-keys.env \
 *     | pnpm --filter @auralis/server record -- --abs <url> --jellyfin <url> [--only abs|jellyfin]
 *
 * `--only oidc` records one real sign-in as the service identity, and the links made for it:
 *
 *   ssh mediaserver cat .config/auralis/upstream-keys.env .config/auralis/oidc.env \
 *     | pnpm --filter @auralis/server record -- --only oidc --oidc <issuer> --oidc-version <v> \
 *         --abs <url> --jellyfin <url>
 *
 * `--dry-run` makes the same calls but writes into a fresh temporary folder instead of the
 * committed recordings, and says where.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { AbsClient } from './audiobookshelf/client.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { recordingSchema } from './http/recording.js';
import { localNames } from './http/localNames.js';
import { scanRecording } from './http/scan.js';
import { JellyfinClient } from './jellyfin/client.js';
import { recordOidc } from './record-oidc.js';

const USAGE = `Usage: <keys on stdin> | pnpm --filter @auralis/server record -- [options]

Records Audiobookshelf's and Jellyfin's calls into server/src/adapters/*/recordings/.

  --abs <url>        Audiobookshelf base URL
  --jellyfin <url>   Jellyfin base URL
  --only <name>      record only abs or jellyfin; or oidc, a sign-in and its links
  --oidc <url>       the sign-on's issuer, for --only oidc
  --oidc-version <v> the sign-on's version, for --only oidc
  --dry-run          write into a temporary folder, not the committed recordings
  --help             show this

stdin carries ABS_API_KEY=... and JELLYFIN_API_KEY=... lines; for --only oidc,
OIDC_CLIENT_SECRET, OIDC_TEST_PASSWORD, ABS_PROVISION_KEY and JELLYFIN_API_KEY.
`;

const CLIENT_VERSION = '0.0.0';
const here = fileURLToPath(new URL('.', import.meta.url));

export interface RecordIo {
  argv: string[];
  stdin: string;
  fetch: FetchLike;
  out: (line: string) => void;
  err: (line: string) => void;
  /** For --only oidc: the state, nonce and verifier's bytes, and the time. */
  random?: (bytes: number) => Buffer;
  now?: () => number;
  /** People's names from the local, uncommitted names file: the scan fails on any of them. */
  names?: readonly string[];
}

/** The `id` of a play answer, from its raw text, whether or not the rest of it parses. */
export function rawSessionId(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (value !== null && typeof value === 'object' && 'id' in value) {
      const { id } = value;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  } catch {
    // Not JSON: there is no id to close.
  }
  return undefined;
}

/** Reads `KEY=value` lines; anything else is ignored. */
export function parseKeys(text: string): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1] && m[2]) keys[m[1]] = m[2];
  }
  return keys;
}

async function recordAbs(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
) {
  const upstreamVersion = await new AbsClient({
    baseUrl,
    token,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion,
    secrets,
    baseUrl,
  });
  // The play answer's session id is read from the raw JSON, before zod parses it, so a session
  // is closed even when the answer fails its schema.
  let sessionId: string | undefined;
  const peekSession: FetchLike = async (url, init) => {
    const response = await rec.fetch(url, init);
    if (init?.method === 'POST' && new URL(url).pathname.endsWith('/play')) {
      sessionId = rawSessionId(await response.clone().text()) ?? sessionId;
    }
    return response;
  };
  const abs = new AbsClient({ baseUrl, token, fetch: peekSession });

  const libraries = await rec.capture('library-list', () => abs.getLibraries());
  // Never the Podcasts library: opening a podcast stub hydrates it.
  const books = libraries.find((l) => l.mediaType === 'book');
  if (!books) throw new Error('Audiobookshelf has no book library');
  const [first] = await abs.getLibraryItems(books.id, 1);
  if (!first) throw new Error('the book library is empty');

  await rec.capture('item-detail', () => abs.getItem(first.id));
  let closed = false;
  try {
    const session = await rec.capture('item-play', () =>
      abs.play(first.id, { deviceId: 'auralis-recorder', clientVersion: CLIENT_VERSION }),
    );
    await rec.capture('session-close', () => abs.closeSession(session.id));
    closed = true;
  } finally {
    // Never leave a playback session open on the server, whatever failed.
    if (sessionId !== undefined && !closed) {
      await abs.closeSession(sessionId).catch(() => undefined);
    }
  }
  return ['library-list', 'item-detail', 'item-play', 'session-close'].map((c) =>
    join(dir, `${c}.json`),
  );
}

async function recordJellyfin(
  io: RecordIo,
  baseUrl: string,
  token: string,
  dir: string,
  secrets: string[],
) {
  const upstreamVersion = await new JellyfinClient({
    baseUrl,
    token,
    fetch: io.fetch,
  }).getServerVersion();
  const rec = createRecorder({
    fetch: io.fetch,
    dir,
    upstream: 'jellyfin',
    upstreamVersion,
    secrets,
    baseUrl,
  });
  const jf = new JellyfinClient({ baseUrl, token, fetch: rec.fetch });

  await rec.capture('library-list', () => jf.getLibraries());
  const [album] = await jf.findAlbums(1);
  if (!album) throw new Error('Jellyfin has no music album');
  await rec.capture('item-detail', () => jf.getItem(album.Id));
  return ['library-list', 'item-detail'].map((c) => join(dir, `${c}.json`));
}

/** Runs record mode; resolves to the process exit code. */
export async function runRecord(io: RecordIo): Promise<number> {
  const { values } = parseArgs({
    args: io.argv,
    options: {
      abs: { type: 'string' },
      jellyfin: { type: 'string' },
      only: { type: 'string' },
      oidc: { type: 'string' },
      'oidc-version': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    io.out(USAGE);
    return 0;
  }
  const only = values.only;
  if (only !== undefined && only !== 'abs' && only !== 'jellyfin' && only !== 'oidc') {
    io.err(`--only is abs, jellyfin or oidc, not ${only}`);
    return 2;
  }
  const root = values['dry-run'] ? mkdtempSync(join(tmpdir(), 'auralis-record-')) : here;
  if (only === 'oidc') return runOidc(io, values, parseKeys(io.stdin), root);
  const wantAbs = only !== 'jellyfin';
  const wantJellyfin = only !== 'abs';
  const keys = parseKeys(io.stdin);
  const absKey = keys.ABS_API_KEY;
  const jellyfinKey = keys.JELLYFIN_API_KEY;
  const missing = [
    wantAbs && !values.abs && '--abs',
    wantAbs && !absKey && 'ABS_API_KEY on stdin',
    wantJellyfin && !values.jellyfin && '--jellyfin',
    wantJellyfin && !jellyfinKey && 'JELLYFIN_API_KEY on stdin',
  ].filter(Boolean);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }

  const secrets = [absKey, jellyfinKey].filter((k): k is string => Boolean(k));
  const written: string[] = [];
  if (wantAbs) {
    written.push(
      ...(await recordAbs(
        io,
        values.abs as string,
        absKey as string,
        join(root, 'audiobookshelf', 'recordings'),
        secrets,
      )),
    );
  }
  if (wantJellyfin) {
    written.push(
      ...(await recordJellyfin(
        io,
        values.jellyfin as string,
        jellyfinKey as string,
        join(root, 'jellyfin', 'recordings'),
        secrets,
      )),
    );
  }

  return scanWritten(io, written, []);
}

/** Scans every written recording; any finding, a name seen while recording included, fails. */
function scanWritten(io: RecordIo, written: string[], seen: readonly string[]): number {
  const names = [...seen, ...(io.names ?? [])];
  let findings = 0;
  for (const file of written) {
    const recording = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    for (const f of scanRecording(recording, { names })) {
      findings += 1;
      io.err(`${file}: ${f.kind} at ${f.path}`);
    }
    io.out(`wrote ${file}`);
  }
  if (findings > 0) {
    io.err(`${findings} finding(s): do not commit these recordings`);
    return 1;
  }
  return 0;
}

async function runOidc(
  io: RecordIo,
  values: Record<string, string | boolean | undefined>,
  keys: Record<string, string>,
  root: string,
): Promise<number> {
  const need = {
    '--oidc': values.oidc,
    '--oidc-version': values['oidc-version'],
    '--abs': values.abs,
    '--jellyfin': values.jellyfin,
    'OIDC_CLIENT_SECRET on stdin': keys.OIDC_CLIENT_SECRET,
    'OIDC_TEST_PASSWORD on stdin': keys.OIDC_TEST_PASSWORD,
    'ABS_PROVISION_KEY on stdin': keys.ABS_PROVISION_KEY,
    'JELLYFIN_API_KEY on stdin': keys.JELLYFIN_API_KEY,
  };
  const missing = Object.entries(need)
    .filter(([, v]) => typeof v !== 'string' || v === '')
    .map(([k]) => k);
  if (missing.length > 0) {
    io.err(`missing ${missing.join(', ')}\n\n${USAGE}`);
    return 2;
  }
  const { written, names } = await recordOidc({
    fetch: io.fetch,
    out: io.out,
    root,
    issuer: values.oidc as string,
    oidcVersion: values['oidc-version'] as string,
    absUrl: values.abs as string,
    jellyfinUrl: values.jellyfin as string,
    keys: {
      clientSecret: keys.OIDC_CLIENT_SECRET as string,
      password: keys.OIDC_TEST_PASSWORD as string,
      absProvisionKey: keys.ABS_PROVISION_KEY as string,
      jellyfinApiKey: keys.JELLYFIN_API_KEY as string,
    },
    ...(io.random ? { random: io.random } : {}),
    ...(io.now ? { now: io.now } : {}),
  });
  return scanWritten(io, written, names);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const stdin = argv.includes('--help') ? '' : await readStdin();
  runRecord({
    argv,
    stdin,
    fetch: (url, init) => globalThis.fetch(url, init),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
    names: localNames(process.env, homedir()),
  }).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}

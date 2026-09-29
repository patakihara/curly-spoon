/**
 * `main.ts` as a process of its own, started by the container image's own start command (the
 * Dockerfile's CMD, run from its final WORKDIR): a child on its environment, on loopback, with no
 * upstream configured, so nothing leaves the machine. It starts, answers its health check, leaves
 * the setup code, and on SIGTERM, as `docker stop` sends it, closes its database and exits 0; a
 * malformed environment stops it before it listens.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));
const DOCKERFILE = fileURLToPath(new URL('../../Dockerfile', import.meta.url));

/** The image's start command: the Dockerfile's CMD in its exec form, and its final WORKDIR. */
function imageStartCommand(): { argv: string[]; workdir: string } {
  const lines = readFileSync(DOCKERFILE, 'utf8').split(/\r?\n/);
  const cmd = lines.findLast((line) => /^CMD\s/.test(line));
  const workdir = lines.findLast((line) => /^WORKDIR\s/.test(line));
  if (cmd === undefined || workdir === undefined)
    throw new Error('Dockerfile has no CMD or WORKDIR');
  return {
    argv: JSON.parse(cmd.replace(/^CMD\s+/, '')) as string[],
    workdir: workdir.replace(/^WORKDIR\s+/, '').trim(),
  };
}

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

let dirs: string[] = [];
let children: ChildProcess[] = [];
afterEach(() => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  children = [];
  dirs = [];
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer().once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

interface Run {
  child: ChildProcess;
  output: () => string;
  /** Resolves when the output matches, or the process exits first. */
  waitFor: (pattern: RegExp) => Promise<boolean>;
  exited: Promise<number | null>;
}

/** Runs the image's start command here: its WORKDIR, /app/server, is this repo's server/. */
function start(env: Record<string, string>): Run {
  const { argv, workdir } = imageStartCommand();
  expect(workdir).toBe('/app/server');
  const [command = '', ...args] = argv;
  const child = spawn(command === 'node' ? process.execPath : command, args, {
    cwd: SERVER_DIR,
    env: { PATH: process.env.PATH ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let output = '';
  const listeners = new Set<() => void>();
  const onData = (chunk: Buffer) => {
    output += chunk.toString('utf8');
    for (const listener of listeners) listener();
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  return {
    child,
    output: () => output,
    exited,
    waitFor: (pattern) =>
      new Promise((resolve) => {
        const check = () => {
          if (pattern.test(output)) resolve(true);
        };
        listeners.add(check);
        check();
        void exited.then(() => resolve(pattern.test(output)));
      }),
  };
}

function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-main-'));
  dirs.push(dir);
  return dir;
}

describe('main.ts', () => {
  it('is started by node itself, so SIGTERM reaches main.ts and not the tsx CLI, which kills it after 30 ms', () => {
    const [command, ...args] = imageStartCommand().argv;
    expect(command).toBe('node');
    expect(args).toEqual(['--import', 'tsx', 'src/main.ts']);
  });

  it('starts on its environment, answers its health check with the commit it was built from, leaves the setup code, and on SIGTERM closes its database and exits 0', async () => {
    const port = await freePort();
    const dir = dataDir();
    const run = start({
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dir,
      WEB_DIST_DIR: dir,
      AURALIS_COMMIT: COMMIT,
    });
    expect(await run.waitFor(/Server listening at/), run.output()).toBe(true);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', commit: COMMIT });
    expect(existsSync(join(dir, 'setup-code'))).toBe(true);
    expect(existsSync(join(dir, 'auralis.sqlite'))).toBe(true);
    expect(run.output()).toContain('No admin yet');

    run.child.kill('SIGTERM');
    expect(await run.exited, run.output()).toBe(0);
    expect(run.output()).toContain('Database closed');
  }, 30_000);

  it('refuses to start on a malformed environment, naming what is missing', async () => {
    const port = await freePort();
    const dir = dataDir();
    const run = start({
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dir,
      OIDC_ISSUER: 'http://sign-on.invalid',
      PUBLIC_ORIGIN: 'http://auralis.invalid',
    });
    expect(await run.exited).not.toBe(0);
    expect(run.output()).toContain('OIDC_CLIENT_SECRET_FILE is required with OIDC_ISSUER');
    expect(run.output()).not.toContain('Server listening');
    expect(existsSync(join(dir, 'auralis.sqlite'))).toBe(false);
  }, 30_000);
});

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

/**
 * The server on recorded upstreams (`pnpm --filter @auralis/server e2e:serve`, as the emulator's
 * tests run it), with its stand-in sign-on: a real sign-in, serving web's build. Each spec starts
 * its own on free ports and stops it when done.
 */
export interface Recorded {
  /** Where the app is. */
  origin: string;
  /** The four-file book, as `{ source, id }`. */
  multiFile: { source: string; id: string };
  stop(): void;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject).listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/** Starts the recorded-upstreams server and reads where it is and what it plays from its banner. */
export async function serveRecorded(): Promise<Recorded> {
  const child = spawn('node_modules/.bin/tsx', ['e2e/serve.ts'], {
    cwd: fileURLToPath(new URL('../../server/', import.meta.url)),
    env: {
      ...process.env,
      AURALIS_E2E_PORT: String(await freePort()),
      AURALIS_E2E_SIGN_ON_PORT: String(await freePort()),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const banner = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.once('exit', (code) => reject(new Error(`e2e:serve exited ${code}: ${out}`)));
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (/^ready$/m.test(out)) resolve(out);
    });
  });
  const line = (label: string) =>
    new RegExp(`^\\s*${label}:\\s*(\\S+)$`, 'm').exec(banner)?.[1] ?? '';
  const key = line('four files');
  return {
    origin: line('app'),
    multiFile: { source: key.slice(0, key.indexOf(':')), id: key.slice(key.indexOf(':') + 1) },
    stop: () => void child.kill('SIGTERM'),
  };
}

/**
 * `pnpm --filter @auralis/server e2e:serve`: the recorded-upstreams server, listening on loopback
 * until it is stopped. It prints where the app and the sign-on are, the test user and the item
 * that plays, then `ready`. Request logs go to stderr.
 *
 * AURALIS_E2E_ADDRESS is the host clients put in URLs (the emulator's `10.0.2.2` in CI);
 * AURALIS_E2E_PORT and AURALIS_E2E_SIGN_ON_PORT are the app's and the sign-on's ports.
 */
import { mediaRefKey } from '@auralis/schema';
import { z } from 'zod';
import { recordedServer } from './recorded.js';

const env = z
  .object({
    AURALIS_E2E_ADDRESS: z.string().min(1).default('127.0.0.1'),
    AURALIS_E2E_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    AURALIS_E2E_SIGN_ON_PORT: z.coerce.number().int().min(1).max(65535).default(8788),
  })
  .parse(process.env);

const server = await recordedServer({
  address: env.AURALIS_E2E_ADDRESS,
  port: env.AURALIS_E2E_PORT,
  signOnPort: env.AURALIS_E2E_SIGN_ON_PORT,
  logger: { stream: process.stderr },
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}

await server.listen();
const out = (line: string) => process.stdout.write(`${line}\n`);
out('Auralis on recorded upstreams (listening on 127.0.0.1)');
out(`  app:      ${server.origin}`);
out(`  sign-on:  ${server.signOn.origin}`);
out(`  user:     ${server.user.username} (${server.user.groups.join(', ')}), any sign-in`);
out(`  playable: ${mediaRefKey(server.playable)}`);
out('ready');

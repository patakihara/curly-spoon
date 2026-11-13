/**
 * `pnpm --filter @auralis/server e2e:serve`: the recorded-upstreams server, listening on loopback
 * until it is stopped. It prints where the app and the sign-on are, the test user, the items
 * that play (a book, a four-file book and a Jellyfin track), the show the library lists and its
 * episode that plays, the album it lists, then `ready`. Request logs go to stderr.
 *
 * AURALIS_E2E_ADDRESS is the host clients put in URLs (the emulator's `10.0.2.2` in CI);
 * AURALIS_E2E_PORT and AURALIS_E2E_SIGN_ON_PORT are the app's and the sign-on's ports;
 * AURALIS_E2E_NOTHING_PLAYED=1 has the recorded person begin with nothing played;
 * AURALIS_E2E_BOOK_SOURCE is how Search's source of books the library lacks behaves;
 * AURALIS_E2E_MUSIC is how a stand-in YouTube Music behaves, with none when unset;
 * AURALIS_E2E_KEPT_ALBUM=1 makes every track of the album it lists a song kept from YouTube Music.
 */
import { mediaRefKey } from '@auralis/schema';
import { z } from 'zod';
import { recordedServer } from './recorded.js';

const env = z
  .object({
    AURALIS_E2E_ADDRESS: z.string().min(1).default('127.0.0.1'),
    AURALIS_E2E_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    AURALIS_E2E_SIGN_ON_PORT: z.coerce.number().int().min(1).max(65535).default(8788),
    AURALIS_E2E_NOTHING_PLAYED: z.literal('1').optional(),
    AURALIS_E2E_BOOK_SOURCE: z.enum(['answers', 'slow', 'failing']).default('answers'),
    AURALIS_E2E_MUSIC: z.enum(['answers', 'unavailable']).optional(),
    AURALIS_E2E_KEPT_ALBUM: z.literal('1').optional(),
  })
  .parse(process.env);

const server = await recordedServer({
  address: env.AURALIS_E2E_ADDRESS,
  port: env.AURALIS_E2E_PORT,
  signOnPort: env.AURALIS_E2E_SIGN_ON_PORT,
  logger: { stream: process.stderr },
  nothingPlayed: env.AURALIS_E2E_NOTHING_PLAYED === '1',
  bookSource: env.AURALIS_E2E_BOOK_SOURCE,
  keptAlbum: env.AURALIS_E2E_KEPT_ALBUM === '1',
  ...(env.AURALIS_E2E_MUSIC === undefined ? {} : { music: env.AURALIS_E2E_MUSIC }),
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
out(`  four files: ${mediaRefKey(server.multiFile)}`);
out(`  music:    ${mediaRefKey(server.music)}`);
out(`  show:     ${mediaRefKey(server.show)}`);
out(`  episode:  ${mediaRefKey(server.episode)}`);
out(`  album:    ${mediaRefKey(server.album)}`);
out('ready');

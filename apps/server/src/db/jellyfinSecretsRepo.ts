/**
 * Per-user Jellyfin access token, encrypted at rest — the credential half of the phase 9
 * "where do Jellyfin credentials live" decision (see `jellyfinUpstream.ts`'s file comment
 * for the full reasoning; this file is the storage layer that decision resolves to).
 *
 * Deliberately a **new, additive table**, not a row in `secrets`:
 *
 * - Jellyfin authenticates per account (`POST /Users/AuthenticateByName`, same as
 *   Audiobookshelf), so the token belongs to whoever signed in — the same reasoning phase 6
 *   used to keep the Audiobookshelf token in `secrets` rather than `provider_configs`
 *   applies here too. `provider_configs` is furthermore the wrong *domain*, not just the
 *   wrong owner: its `kind` column is typed `ProviderKind = 'indexer' | 'download'`
 *   (`requests/types.ts`) — the request pipeline's two provider roles. Jellyfin is a media
 *   source, not a request provider; reusing that table would be a type-level misuse.
 * - Not a widened `secrets`, either. That table's schema only ever supported one credential
 *   per user (`PRIMARY KEY (user_id)`) — even though `setUpstreamToken` already took an
 *   `upstream` parameter, calling it for a second upstream would silently clobber the
 *   first, a latent bug worth fixing on its own but out of scope here. Widening it to a
 *   composite key is a real migration with a data-copy step this test harness can't
 *   meaningfully exercise (every test opens a fresh `:memory:` DB and runs every migration
 *   at once, so that step would only ever run against an empty table) — for zero benefit
 *   over a second table scoped to exactly what's new. `secrets` and every Audiobookshelf
 *   auth read/write stay untouched.
 *
 * `getJellyfinToken` degrades an undecryptable ciphertext to `null` rather than throwing —
 * matching `providerConfigRepo.ts`'s established behaviour for exactly this situation
 * (`SESSION_SECRET` rotating invalidates every stored secret; the useful outcome is "the
 * settings screen asks you to reconnect Jellyfin", not a 500 on every browse/search call).
 * `secrets`' own `getUpstreamToken` does *not* do this — it lets `decryptSecret` throw
 * bare — which is the gap this file closes for Jellyfin specifically rather than inheriting.
 */

import type { Db } from './connection.js';
import { decryptSecret, encryptSecret } from './crypto.js';

interface JellyfinSecretRow {
  ciphertext: string;
}

export function setJellyfinToken(
  db: Db,
  userId: string,
  token: string,
  sessionSecret: string,
): void {
  const ciphertext = encryptSecret(token, sessionSecret);
  db.prepare(
    `INSERT INTO jellyfin_secrets (user_id, ciphertext, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       updated_at = excluded.updated_at`,
  ).run(userId, ciphertext, Date.now());
}

/**
 * `null` when this user has no stored Jellyfin token (never connected one, it was deleted,
 * or the stored ciphertext can no longer be decrypted with the current `SESSION_SECRET`) —
 * every case reads as "not connected", never as an error. See the file comment for why
 * this differs from `secretsRepo.getUpstreamToken`.
 */
export function getJellyfinToken(db: Db, userId: string, sessionSecret: string): string | null {
  const row = db
    .prepare('SELECT ciphertext FROM jellyfin_secrets WHERE user_id = ?')
    .get(userId) as JellyfinSecretRow | undefined;
  if (!row) return null;
  try {
    return decryptSecret(row.ciphertext, sessionSecret);
  } catch {
    return null;
  }
}

export function deleteJellyfinToken(db: Db, userId: string): void {
  db.prepare('DELETE FROM jellyfin_secrets WHERE user_id = ?').run(userId);
}

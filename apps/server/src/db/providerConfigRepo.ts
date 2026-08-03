/**
 * Server-scoped configuration for request providers (indexers, download clients).
 *
 * Separate from `secretsRepo` on purpose: that table is keyed by `user_id`, because an
 * Audiobookshelf token is the signed-in person's. A Prowlarr API key is the installation's
 * — the same key whoever is looking — so it is keyed by provider id instead.
 *
 * A row whose secret cannot be decrypted is treated as **unconfigured**, not as an error.
 * `SESSION_SECRET` changing invalidates every stored secret (see HANDOVER §6), and the
 * useful behaviour there is "the settings screen asks you to re-enter the key", not a
 * 500 on every search.
 */

import type { Db } from './connection.js';
import { decryptSecret, encryptSecret } from './crypto.js';
import type { ProviderKind, ResolvedProviderConfig } from '../requests/types.js';

interface ProviderConfigRow {
  id: string;
  kind: string;
  enabled: number;
  base_url: string | null;
  options: string;
  ciphertext: string | null;
  updated_at: number;
}

export interface ProviderConfigInput {
  id: string;
  kind: ProviderKind;
  enabled: boolean;
  baseUrl: string | null;
  options: Record<string, unknown>;
  /**
   * `undefined` leaves an existing secret untouched — which is what a settings form that
   * shows a masked placeholder must do. `null` clears it explicitly.
   */
  secret?: string | null;
}

function parseOptions(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    // A hand-edited database should degrade to "no options", not take the server down.
    return {};
  }
}

function toResolved(row: ProviderConfigRow, sessionSecret: string): ResolvedProviderConfig {
  let secret: string | null = null;
  if (row.ciphertext !== null) {
    try {
      secret = decryptSecret(row.ciphertext, sessionSecret);
    } catch {
      secret = null;
    }
  }
  return {
    id: row.id,
    kind: row.kind as ProviderKind,
    enabled: row.enabled === 1,
    baseUrl: row.base_url,
    options: parseOptions(row.options),
    secret,
  };
}

export function getProviderConfig(
  db: Db,
  id: string,
  sessionSecret: string,
): ResolvedProviderConfig | null {
  const row = db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as
    ProviderConfigRow | undefined;
  return row ? toResolved(row, sessionSecret) : null;
}

/** Every configured provider, optionally narrowed to one kind, ordered by id for stable UI. */
export function listProviderConfigs(
  db: Db,
  sessionSecret: string,
  kind?: ProviderKind,
): ResolvedProviderConfig[] {
  const rows = (
    kind === undefined
      ? db.prepare('SELECT * FROM provider_configs ORDER BY id').all()
      : db.prepare('SELECT * FROM provider_configs WHERE kind = ? ORDER BY id').all(kind)
  ) as ProviderConfigRow[];
  return rows.map((row) => toResolved(row, sessionSecret));
}

export function setProviderConfig(
  db: Db,
  input: ProviderConfigInput,
  sessionSecret: string,
): ResolvedProviderConfig {
  const updatedAt = Date.now();
  const options = JSON.stringify(input.options);

  if (input.secret === undefined) {
    // Omitting `ciphertext` from the DO UPDATE list is what preserves an existing secret;
    // the NULL in VALUES only applies to the insert case, where there is nothing to keep.
    db.prepare(
      `INSERT INTO provider_configs (id, kind, enabled, base_url, options, ciphertext, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         enabled = excluded.enabled,
         base_url = excluded.base_url,
         options = excluded.options,
         updated_at = excluded.updated_at`,
    ).run(input.id, input.kind, input.enabled ? 1 : 0, input.baseUrl, options, updatedAt);
  } else {
    const ciphertext = input.secret === null ? null : encryptSecret(input.secret, sessionSecret);
    db.prepare(
      `INSERT INTO provider_configs (id, kind, enabled, base_url, options, ciphertext, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         enabled = excluded.enabled,
         base_url = excluded.base_url,
         options = excluded.options,
         ciphertext = excluded.ciphertext,
         updated_at = excluded.updated_at`,
    ).run(
      input.id,
      input.kind,
      input.enabled ? 1 : 0,
      input.baseUrl,
      options,
      ciphertext,
      updatedAt,
    );
  }

  const saved = getProviderConfig(db, input.id, sessionSecret);
  // The row was just written in the same connection, so this cannot be null; the check
  // keeps the return type honest without an assertion.
  if (!saved) throw new Error(`provider config ${input.id} vanished immediately after write`);
  return saved;
}

export function deleteProviderConfig(db: Db, id: string): void {
  db.prepare('DELETE FROM provider_configs WHERE id = ?').run(id);
}

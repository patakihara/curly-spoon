/**
 * Each person's own account on each upstream, and the token that acts as them there, encrypted
 * with the row it belongs to bound in: a ciphertext moved to another row fails to decrypt. An
 * upstream account belongs to at most one Auralis user.
 */

import { z } from 'zod';
import { decryptSecret, encryptSecret } from '../crypto/secretBox.js';
import type { Db } from './connection.js';

export const Service = z.enum(['abs', 'jellyfin']);
export type Service = z.infer<typeof Service>;
export const SERVICES: readonly Service[] = Service.options;

export const LinkState = z.enum(['linked', 'unlinked', 'stale', 'error']);
export type LinkState = z.infer<typeof LinkState>;

export interface Link {
  userId: string;
  service: Service;
  upstreamUserId: string | null;
  /** Audiobookshelf's key id, so the key can be deleted later. */
  upstreamKeyId: string | null;
  /** Auralis created the upstream account itself instead of finding it. */
  createdByAuralis: boolean;
  state: LinkState;
  detail: string | null;
  updatedAt: number;
  hasToken: boolean;
}

const LinkRow = z
  .object({
    user_id: z.string(),
    service: Service,
    upstream_user_id: z.string().nullable(),
    token_ciphertext: z.string().nullable(),
    upstream_key_id: z.string().nullable(),
    created_by_auralis: z.union([z.literal(0), z.literal(1)]),
    state: LinkState,
    detail: z.string().nullable(),
    updated_at: z.number(),
  })
  .transform((row): Link => ({
    userId: row.user_id,
    service: row.service,
    upstreamUserId: row.upstream_user_id,
    upstreamKeyId: row.upstream_key_id,
    createdByAuralis: row.created_by_auralis === 1,
    state: row.state,
    detail: row.detail,
    updatedAt: row.updated_at,
    hasToken: row.token_ciphertext !== null,
  }));

/** Another Auralis user already holds this upstream account. */
export class UpstreamAccountTaken extends Error {
  constructor(service: Service) {
    super(`that ${service} account is linked to another user`);
    this.name = 'UpstreamAccountTaken';
  }
}

const aad = (userId: string, service: Service) => `${userId}|${service}`;

export function getLink(db: Db, userId: string, service: Service): Link | null {
  const raw = db
    .prepare('SELECT * FROM upstream_links WHERE user_id = ? AND service = ?')
    .get(userId, service);
  return raw === undefined ? null : LinkRow.parse(raw);
}

export function listLinks(db: Db, userId: string): Link[] {
  return z
    .array(LinkRow)
    .parse(
      db.prepare('SELECT * FROM upstream_links WHERE user_id = ? ORDER BY service').all(userId),
    );
}

/** The account the id belongs to, whoever holds it. */
export function findLinkByUpstreamUser(
  db: Db,
  service: Service,
  upstreamUserId: string,
): Link | null {
  const raw = db
    .prepare('SELECT * FROM upstream_links WHERE service = ? AND upstream_user_id = ?')
    .get(service, upstreamUserId);
  return raw === undefined ? null : LinkRow.parse(raw);
}

export interface SaveLink {
  userId: string;
  service: Service;
  upstreamUserId: string | null;
  token: string | null;
  upstreamKeyId?: string | null;
  createdByAuralis?: boolean;
  state: LinkState;
  detail?: string | null;
}

/** Writes the whole row, the token encrypted. Throws `UpstreamAccountTaken` on a held account. */
export function saveLink(db: Db, key: Buffer, link: SaveLink, now: number = Date.now()): Link {
  const holder =
    link.upstreamUserId === null
      ? null
      : findLinkByUpstreamUser(db, link.service, link.upstreamUserId);
  if (holder !== null && holder.userId !== link.userId) {
    throw new UpstreamAccountTaken(link.service);
  }
  db.prepare(
    `INSERT INTO upstream_links (user_id, service, upstream_user_id, token_ciphertext,
       upstream_key_id, created_by_auralis, state, detail, updated_at)
     VALUES (@userId, @service, @upstreamUserId, @ciphertext, @keyId, @created, @state, @detail,
       @now)
     ON CONFLICT (user_id, service) DO UPDATE SET upstream_user_id = excluded.upstream_user_id,
       token_ciphertext = excluded.token_ciphertext, upstream_key_id = excluded.upstream_key_id,
       created_by_auralis = excluded.created_by_auralis, state = excluded.state, detail = excluded.detail, updated_at = excluded.updated_at`,
  ).run({
    userId: link.userId,
    service: link.service,
    upstreamUserId: link.upstreamUserId,
    ciphertext:
      link.token === null ? null : encryptSecret(link.token, key, aad(link.userId, link.service)),
    keyId: link.upstreamKeyId ?? null,
    created: link.createdByAuralis === true ? 1 : 0,
    state: link.state,
    detail: link.detail ?? null,
    now,
  });
  const saved = getLink(db, link.userId, link.service);
  if (!saved) throw new Error('invariant: the link row just written is missing');
  return saved;
}

/** Keeps the pinned account and token, changes only the state. */
export function markLink(
  db: Db,
  userId: string,
  service: Service,
  state: LinkState,
  detail: string | null,
  now: number = Date.now(),
): void {
  db.prepare(
    `UPDATE upstream_links SET state = ?, detail = ?, updated_at = ?
     WHERE user_id = ? AND service = ?`,
  ).run(state, detail, now, userId, service);
}

/** This user's own token on this service, decrypted; `null` when there is none. */
export function readToken(db: Db, key: Buffer, userId: string, service: Service): string | null {
  const raw = db
    .prepare('SELECT token_ciphertext FROM upstream_links WHERE user_id = ? AND service = ?')
    .get(userId, service);
  const row = z.object({ token_ciphertext: z.string().nullable() }).optional().parse(raw);
  if (row?.token_ciphertext == null) return null;
  return decryptSecret(row.token_ciphertext, key, aad(userId, service));
}

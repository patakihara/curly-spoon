/** Each browser or app install a user signs in from. Deleting one ends its sessions. */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './connection.js';

export const DeviceKind = z.enum(['web', 'android']);
export type DeviceKind = z.infer<typeof DeviceKind>;

export interface Device {
  id: string;
  userId: string;
  kind: DeviceKind;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

const DeviceRow = z
  .object({
    id: z.string(),
    user_id: z.string(),
    kind: DeviceKind,
    name: z.string(),
    created_at: z.number(),
    last_seen_at: z.number(),
  })
  .transform((row): Device => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));

const DEFAULT_NAMES: Record<DeviceKind, string> = { web: 'Web browser', android: 'Android' };

export function createDevice(
  db: Db,
  params: { userId: string; kind: DeviceKind; name?: string },
  now: number = Date.now(),
): Device {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO devices (id, user_id, kind, name, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, params.userId, params.kind, params.name ?? DEFAULT_NAMES[params.kind], now, now);
  const device = getDevice(db, params.userId, id);
  if (!device) throw new Error('invariant: the device row just written is missing');
  return device;
}

/** Only the owner's device: another user's id reads as missing. */
export function getDevice(db: Db, userId: string, id: string): Device | null {
  const raw = db.prepare('SELECT * FROM devices WHERE id = ? AND user_id = ?').get(id, userId);
  return raw === undefined ? null : DeviceRow.parse(raw);
}

export function listDevices(db: Db, userId: string): Device[] {
  return z
    .array(DeviceRow)
    .parse(db.prepare('SELECT * FROM devices WHERE user_id = ? ORDER BY created_at').all(userId));
}

/** The existing device when this user owns it and it is of this kind, else a new one. */
export function reuseOrCreateDevice(
  db: Db,
  params: { userId: string; kind: DeviceKind; id?: string | undefined },
  now: number = Date.now(),
): Device {
  const existing = params.id === undefined ? null : getDevice(db, params.userId, params.id);
  if (existing !== null && existing.kind === params.kind) {
    touchDevice(db, existing.id, now);
    return { ...existing, lastSeenAt: now };
  }
  return createDevice(db, { userId: params.userId, kind: params.kind }, now);
}

export function renameDevice(db: Db, userId: string, id: string, name: string): Device | null {
  db.prepare('UPDATE devices SET name = ? WHERE id = ? AND user_id = ?').run(name, id, userId);
  return getDevice(db, userId, id);
}

/** Removes the device and, by cascade, every session on it. False when it is not this user's. */
export function deleteDevice(db: Db, userId: string, id: string): boolean {
  return db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

export function touchDevice(db: Db, id: string, now: number = Date.now()): void {
  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, id);
}

/** The upstream connection config (currently just Audiobookshelf's base URL) set once during /setup. */

import type { Db } from './connection.js';

export const DEFAULT_UPSTREAM = 'audiobookshelf';

export interface UpstreamSettings {
  upstream: string;
  baseUrl: string;
  updatedAt: number;
}

interface SettingsRow {
  upstream: string;
  base_url: string;
  updated_at: number;
}

export function getSettings(db: Db, upstream: string = DEFAULT_UPSTREAM): UpstreamSettings | null {
  const row = db
    .prepare('SELECT upstream, base_url, updated_at FROM settings WHERE upstream = ?')
    .get(upstream) as SettingsRow | undefined;
  if (!row) return null;
  return { upstream: row.upstream, baseUrl: row.base_url, updatedAt: row.updated_at };
}

export function setSettings(
  db: Db,
  baseUrl: string,
  upstream: string = DEFAULT_UPSTREAM,
): UpstreamSettings {
  const updatedAt = Date.now();
  db.prepare(
    `INSERT INTO settings (upstream, base_url, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(upstream) DO UPDATE SET base_url = excluded.base_url, updated_at = excluded.updated_at`,
  ).run(upstream, baseUrl, updatedAt);
  return { upstream, baseUrl, updatedAt };
}

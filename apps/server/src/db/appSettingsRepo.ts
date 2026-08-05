/**
 * Installation-wide preferences that belong to no particular upstream or provider.
 *
 * Typed accessors over a key/value table: later phases add a getter here rather than a
 * migration, and every key has a default so a fresh install is fully functional before
 * anyone opens the settings screen.
 */

import type { Db } from './connection.js';

/**
 * Whether a request needs a human to say yes.
 *
 * Defaults to `auto` because the overwhelmingly common deployment is one person's own
 * media server, where an approval queue is a step that only ever approves. Multi-user
 * installs flip this in settings.
 */
export type ApprovalPolicy = 'auto' | 'manual';

export const APP_SETTING_KEYS = {
  approvalPolicy: 'requests.approvalPolicy',
  /**
   * The directory the download client should save book downloads into, expressed in the
   * **download client's** filesystem namespace. Empty means "leave the client's default
   * alone" — Auralis cannot discover the path Audiobookshelf watches, and guessing it
   * produces downloads that complete and are never imported.
   */
  bookSavePath: 'requests.bookSavePath',
  /** Client-side label applied to downloads Auralis creates, so they are identifiable. */
  bookCategory: 'requests.bookCategory',
  /**
   * Same gap as `bookSavePath`, for slskd: expressed in **slskd's own** filesystem
   * namespace, which is additionally always relative (`music/slskd.ts`'s
   * `isRelativeSavePath` rejects an absolute path or a `..` segment — slskd's own model
   * validation rejects the shape `bookSavePath` is documented to be). Empty means "leave
   * slskd's default download directory alone".
   */
  musicSavePath: 'requests.musicSavePath',
  /** `bookCategory`'s music counterpart. */
  musicCategory: 'requests.musicCategory',
} as const;

const DEFAULTS: Record<string, string> = {
  [APP_SETTING_KEYS.approvalPolicy]: 'auto',
  [APP_SETTING_KEYS.bookSavePath]: '',
  [APP_SETTING_KEYS.bookCategory]: 'auralis-books',
  [APP_SETTING_KEYS.musicSavePath]: '',
  [APP_SETTING_KEYS.musicCategory]: 'auralis-music',
};

export function getAppSetting(db: Db, key: string): string {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? DEFAULTS[key] ?? '';
}

export function setAppSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, Date.now());
}

/** Anything other than the literal `manual` reads as `auto` — an unusable value must not lock requests out. */
export function getApprovalPolicy(db: Db): ApprovalPolicy {
  return getAppSetting(db, APP_SETTING_KEYS.approvalPolicy) === 'manual' ? 'manual' : 'auto';
}

/** `null` rather than `''`, so it drops straight into `AddDownloadOptions.savePath`. */
export function getBookSavePath(db: Db): string | null {
  const value = getAppSetting(db, APP_SETTING_KEYS.bookSavePath).trim();
  return value === '' ? null : value;
}

export function getBookCategory(db: Db): string | null {
  const value = getAppSetting(db, APP_SETTING_KEYS.bookCategory).trim();
  return value === '' ? null : value;
}

/** `null` rather than `''`, same as `getBookSavePath` — drops straight into
 * `AddDownloadOptions.savePath`. Callers passing this to slskd must not reuse
 * `getBookSavePath`: slskd rejects the absolute-path shape that setting is documented as. */
export function getMusicSavePath(db: Db): string | null {
  const value = getAppSetting(db, APP_SETTING_KEYS.musicSavePath).trim();
  return value === '' ? null : value;
}

export function getMusicCategory(db: Db): string | null {
  const value = getAppSetting(db, APP_SETTING_KEYS.musicCategory).trim();
  return value === '' ? null : value;
}

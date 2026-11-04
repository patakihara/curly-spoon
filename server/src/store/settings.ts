/**
 * Each person's settings, one row per person (migration 15). A person with no row has the
 * defaults; a change is merged into what is stored, so it changes only what it names.
 */
import { DEFAULT_SETTINGS, QueueStyle, Settings, type SettingsBody, Theme } from '@auralis/schema';
import { z } from 'zod';
import type { Db } from './connection.js';

const Flag = z.union([z.literal(0), z.literal(1)]).transform((n) => n === 1);

const SettingsRow = z
  .object({
    theme: Theme,
    queue_style: QueueStyle,
    autoplay_music: Flag,
    autoplay_spoken: Flag,
    first_run_done: Flag,
    show_everyone: Flag,
  })
  .transform((row): Settings => ({
    theme: row.theme,
    autoplay: { music: row.autoplay_music, spoken: row.autoplay_spoken },
    queueStyle: row.queue_style,
    firstRunDone: row.first_run_done,
    showEveryonesLibrary: row.show_everyone,
  }));

/** A person's settings: what they stored, or the defaults. */
export function readSettings(db: Db, userId: string): Settings {
  const row: unknown = db
    .prepare(
      `SELECT theme, queue_style, autoplay_music, autoplay_spoken, first_run_done, show_everyone
       FROM user_settings WHERE user_id = ?`,
    )
    .get(userId);
  return row === undefined ? structuredClone(DEFAULT_SETTINGS) : SettingsRow.parse(row);
}

/** Merges a change into a person's settings and answers them as they now stand. */
export function writeSettings(db: Db, userId: string, change: SettingsBody, now: number): Settings {
  return db.transaction(() => {
    const was = readSettings(db, userId);
    const next = Settings.parse({
      theme: change.theme ?? was.theme,
      autoplay: { ...was.autoplay, ...change.autoplay },
      queueStyle: change.queueStyle ?? was.queueStyle,
      firstRunDone: change.firstRunDone ?? was.firstRunDone,
      showEveryonesLibrary: change.showEveryonesLibrary ?? was.showEveryonesLibrary,
    });
    db.prepare(
      `INSERT INTO user_settings
         (user_id, theme, queue_style, autoplay_music, autoplay_spoken, first_run_done,
          show_everyone, updated_at)
       VALUES (@user, @theme, @style, @music, @spoken, @done, @everyone, @now)
       ON CONFLICT (user_id) DO UPDATE SET
         theme = excluded.theme, queue_style = excluded.queue_style,
         autoplay_music = excluded.autoplay_music, autoplay_spoken = excluded.autoplay_spoken,
         first_run_done = excluded.first_run_done, show_everyone = excluded.show_everyone,
         updated_at = excluded.updated_at`,
    ).run({
      user: userId,
      theme: next.theme,
      style: next.queueStyle,
      music: Number(next.autoplay.music),
      spoken: Number(next.autoplay.spoken),
      done: Number(next.firstRunDone),
      everyone: Number(next.showEveryonesLibrary),
      now,
    });
    return next;
  })();
}

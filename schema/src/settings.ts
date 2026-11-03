/**
 * Each person's settings, the same on every device of theirs: the theme, autoplay on or off for
 * each queue, the queue style, and whether they have finished first-run setup. A person who never
 * changed one has its default. A change names only what it changes, so two devices changing
 * different settings never undo each other; the last write of a setting wins.
 */
import { QueueStyle } from './sessions.js';
import { z } from './zod.js';

/** Light or dark from the system, unless the person picks one. */
export const Theme = z.enum(['system', 'light', 'dark']).openapi('Theme');
export type Theme = z.infer<typeof Theme>;

/** Whether each queue autoplays once it runs out: music, and the spoken queue. */
export const AutoplaySwitches = z
  .object({ music: z.boolean(), spoken: z.boolean() })
  .openapi('AutoplaySwitches');
export type AutoplaySwitches = z.infer<typeof AutoplaySwitches>;

/** A person's settings, every one answered. */
export const Settings = z
  .object({
    theme: Theme,
    autoplay: AutoplaySwitches,
    queueStyle: QueueStyle,
    /** Whether this person has finished first-run setup; Setup then goes straight to Browse. */
    firstRunDone: z.boolean(),
  })
  .openapi('Settings');
export type Settings = z.infer<typeof Settings>;

/**
 * The settings of a person who never changed one. user_settings' column DEFAULTs (migration 15)
 * repeat all but the queue style, for its copied rows.
 */
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoplay: { music: true, spoken: true },
  queueStyle: 'youtube',
  firstRunDone: false,
};

/** A change to some autoplay switches: only those named change. */
export const AutoplaySwitchesChange = z
  .object({ music: z.boolean().optional(), spoken: z.boolean().optional() })
  .strict()
  .openapi('AutoplaySwitchesChange');
export type AutoplaySwitchesChange = z.infer<typeof AutoplaySwitchesChange>;

/** A change to some settings: only those named change, and an unknown one is refused. */
export const SettingsBody = z
  .object({
    theme: Theme.optional(),
    autoplay: AutoplaySwitchesChange.optional(),
    queueStyle: QueueStyle.optional(),
    firstRunDone: z.boolean().optional(),
  })
  .strict()
  .openapi('SettingsBody');
export type SettingsBody = z.infer<typeof SettingsBody>;

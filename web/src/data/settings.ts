import { type Settings } from '@auralis/schema';
import { type ApiClient } from '../api/client';
import { type SettingsData } from '../generated/pages/Settings';
import { type ToggleSetting } from '../toggle';
import { emptied } from './format';
import { SignedOut } from './store';

/**
 * Settings' data: the switch that shows everyone's library, from `GET /api/settings`, set through
 * `PUT /api/settings`. Every other row waits for M5.settings, and draws as a page nothing serves.
 */

/** Settings while its answer loads, or when it failed: the switch's words, off. */
export function settingsAwaited(page: SettingsData): SettingsData {
  return { ...emptied(page), everyone: { ...page.everyone, checked: false } };
}

/** Settings with the switch saying what the server holds. */
export function settingsData(settings: Settings, page: SettingsData): SettingsData {
  const awaited = settingsAwaited(page);
  return { ...awaited, everyone: { ...awaited.everyone, checked: settings.showEveryonesLibrary } };
}

/** Sets a setting to what its switch says. A change names only what it changes. */
export async function setSetting(
  api: ApiClient,
  setting: ToggleSetting,
  next: boolean,
): Promise<void> {
  const { response } = await api.PUT('/api/settings', { body: { [setting]: next } });
  if (response.status === 401) throw new SignedOut();
  if (!response.ok) throw new Error(`${setting} answered ${response.status}`);
}

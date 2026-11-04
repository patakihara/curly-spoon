import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  getSettings,
  putSettings,
  routes,
  Settings,
  SettingsBody,
} from '../src/index.js';

describe('a person’s settings', () => {
  it('start as the system theme, both autoplay switches on, YouTube Music style, first run not done, showing only their own library', () => {
    expect(Settings.parse(DEFAULT_SETTINGS)).toEqual({
      theme: 'system',
      autoplay: { music: true, spoken: true },
      queueStyle: 'youtube',
      firstRunDone: false,
      showEveryonesLibrary: false,
    });
  });

  it('answer every setting', () => {
    const { firstRunDone: _left, ...missing } = DEFAULT_SETTINGS;
    expect(Settings.safeParse(missing).success).toBe(false);
  });
});

describe('a change to settings', () => {
  it('names only what it changes, down to one autoplay switch', () => {
    expect(SettingsBody.parse({})).toEqual({});
    expect(SettingsBody.parse({ autoplay: { spoken: false } })).toEqual({
      autoplay: { spoken: false },
    });
    expect(SettingsBody.parse({ theme: 'dark', firstRunDone: true })).toEqual({
      theme: 'dark',
      firstRunDone: true,
    });
  });

  it('refuses an unknown setting, an unknown switch and a value no setting takes', () => {
    expect(SettingsBody.safeParse({ volume: 3 }).success).toBe(false);
    expect(SettingsBody.safeParse({ autoplay: { video: true } }).success).toBe(false);
    expect(SettingsBody.safeParse({ theme: 'blue' }).success).toBe(false);
    expect(SettingsBody.safeParse({ queueStyle: 'apple' }).success).toBe(false);
    expect(SettingsBody.safeParse({ autoplay: { music: 'yes' } }).success).toBe(false);
  });
});

describe('the settings routes', () => {
  it('read and change the signed-in person’s settings, each answering them whole', () => {
    expect(getSettings).toMatchObject({ method: 'GET', path: '/api/settings', access: 'member' });
    expect(putSettings).toMatchObject({ method: 'PUT', path: '/api/settings', access: 'member' });
    expect(getSettings.response).toBe(Settings);
    expect(putSettings.response).toBe(Settings);
    expect(putSettings.body).toBe(SettingsBody);
    expect(routes).toContain(getSettings);
    expect(routes).toContain(putSettings);
  });
});

import { DEFAULT_SETTINGS } from '@auralis/schema';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client';
import { frame } from '../generated/pages/Settings';
import { setSetting, settingsAwaited, settingsData } from './settings';
import { SignedOut } from './store';

describe('[M3.requests/c] the switch that shows everyone’s library', () => {
  it('says what the server holds, in the page’s own words', () => {
    const on = settingsData({ ...DEFAULT_SETTINGS, showEveryonesLibrary: true }, frame.placeholder);
    expect(on.everyone).toEqual({ ...frame.placeholder.everyone, checked: true });
    expect(settingsData(DEFAULT_SETTINGS, frame.placeholder).everyone.checked).toBe(false);
  });

  it('draws the other switches as a page nothing serves, none of the samples', () => {
    expect(settingsData(DEFAULT_SETTINGS, frame.placeholder).settings).toEqual([]);
    expect(settingsAwaited(frame.placeholder).settings).toEqual([]);
  });

  it('is off until the answer comes', () => {
    expect(settingsAwaited(frame.placeholder).everyone.checked).toBe(false);
  });

  const answering = (status: number) => {
    const sent: { method: string; url: string; body: string }[] = [];
    const fetch = vi.fn(async (asked: Request) => {
      sent.push({
        method: asked.method,
        url: new URL(asked.url).pathname,
        body: await asked.text(),
      });
      return Response.json(DEFAULT_SETTINGS, { status });
    });
    return { sent, api: createApiClient({ baseUrl: 'http://a.test', fetch }) };
  };

  it('sets the one setting it names', async () => {
    const { sent, api } = answering(200);
    await setSetting(api, 'showEveryonesLibrary', true);
    expect(sent).toEqual([
      { method: 'PUT', url: '/api/settings', body: '{"showEveryonesLibrary":true}' },
    ]);
  });

  it('says when signed out, and when refused', async () => {
    await expect(
      setSetting(answering(401).api, 'showEveryonesLibrary', true),
    ).rejects.toBeInstanceOf(SignedOut);
    await expect(setSetting(answering(500).api, 'showEveryonesLibrary', true)).rejects.toThrow(
      '500',
    );
  });
});

/**
 * `buildSecretPayload` decides what a provider's Save button actually sends for
 * its secret fields. Getting this backwards silently destroys the user's stored
 * credentials (an omitted `secret` keeps what's stored; an included one — even
 * with empty strings — overwrites it), so every branch is pinned here rather
 * than only exercised end-to-end.
 */
import { describe, expect, it } from 'vitest';
import { buildSecretPayload } from './providerForm.js';

describe('buildSecretPayload', () => {
  it('omits `secret` entirely when a configured provider had no fields touched — keeps the stored credential', () => {
    const result = buildSecretPayload({
      hasSecret: true,
      secretFieldKeys: ['apiKey'],
      values: {},
      touchedKeys: new Set(),
    });
    expect(result).toBeUndefined();
  });

  it('sends only the touched field when a configured provider has several secret fields', () => {
    const result = buildSecretPayload({
      hasSecret: true,
      secretFieldKeys: ['username', 'password'],
      values: { username: 'new-user' },
      touchedKeys: new Set(['username']),
    });
    expect(result).toEqual({ username: 'new-user' });
  });

  it('sends every touched field, still omitting untouched ones, so a partial edit cannot clobber the rest', () => {
    const result = buildSecretPayload({
      hasSecret: true,
      secretFieldKeys: ['username', 'password'],
      values: { username: 'new-user', password: 'new-pass' },
      touchedKeys: new Set(['username', 'password']),
    });
    expect(result).toEqual({ username: 'new-user', password: 'new-pass' });
  });

  it('sends an empty string for a field the user typed into and then cleared — that is a deliberate clear, not a no-op', () => {
    const result = buildSecretPayload({
      hasSecret: true,
      secretFieldKeys: ['apiKey'],
      values: { apiKey: '' },
      touchedKeys: new Set(['apiKey']),
    });
    expect(result).toEqual({ apiKey: '' });
  });

  it('sends every field for a provider with no stored secret yet — there is nothing to protect', () => {
    const result = buildSecretPayload({
      hasSecret: false,
      secretFieldKeys: ['username', 'password'],
      values: { username: 'kara' },
      touchedKeys: new Set(),
    });
    expect(result).toEqual({ username: 'kara', password: '' });
  });
});

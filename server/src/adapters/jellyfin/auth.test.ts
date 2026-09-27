import { describe, expect, it } from 'vitest';
import { buildAuthorizationHeader } from './auth.js';

const device = { client: 'Auralis', device: 'Chrome', deviceId: 'device-1', version: '0.1.0' };

describe('buildAuthorizationHeader', () => {
  it('builds a MediaBrowser-scheme header from client/device/deviceId/version, with no Token field when unauthenticated', () => {
    const header = buildAuthorizationHeader(device);
    expect(header).toBe(
      'MediaBrowser Client="Auralis", Device="Chrome", DeviceId="device-1", Version="0.1.0"',
    );
  });

  it('appends a Token field once a token is supplied', () => {
    const header = buildAuthorizationHeader(device, 'access-token-1');
    expect(header).toBe(
      'MediaBrowser Client="Auralis", Device="Chrome", DeviceId="device-1", Version="0.1.0", Token="access-token-1"',
    );
  });

  it('omits the Token field for an empty-string token, same as no token', () => {
    const header = buildAuthorizationHeader(device, '');
    expect(header).not.toContain('Token=');
  });

  it('strips embedded double quotes from a field rather than emitting a value the server cannot parse', () => {
    // Jellyfin's own header parser (AuthorizationContext.GetParts) toggles a
    // quoted-value state on `"` with no backslash-escape support, so a
    // backslash-escaped quote would not round-trip — stripping is the safe,
    // total choice for values we do not fully control (e.g. a user-edited
    // device name).
    const header = buildAuthorizationHeader({ ...device, device: 'My "Phone"' });
    expect(header).toContain('Device="My Phone"');
    expect(header).not.toContain('\\"');
  });
});

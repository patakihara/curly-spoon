/**
 * Jellyfin identifies every API caller through a `MediaBrowser`-scheme
 * `Authorization` header carrying `Client`/`Device`/`DeviceId`/`Version`, plus a
 * `Token` field once a session exists — never a `Bearer` token, unlike
 * Audiobookshelf. Verified against the real server source, not memory:
 * `Jellyfin.Server.Implementations/Security/AuthorizationContext.cs`
 * (`GetAuthorizationDictionary` reads the `Authorization` header — falling back
 * to the legacy `X-Emby-Authorization` header only when the server has
 * `EnableLegacyAuthorization` on — and `GetParts` parses `Key="value"` pairs
 * separated by `, ` after the leading `MediaBrowser ` scheme word).
 *
 * The same header (without `Token`) is expected on the login call itself:
 * `Jellyfin.Api/Controllers/UserController.cs`'s `AuthenticateUserByName` reads
 * `auth.Client`/`auth.Version`/`auth.DeviceId`/`auth.Device` from it to name the
 * new session, even though the endpoint itself requires no prior token.
 */

export interface JellyfinDeviceInfo {
  /** The calling application's name, e.g. "Auralis". */
  client: string;
  /** A human-readable name for this device/browser, e.g. "Chrome" or a device model. */
  device: string;
  /** A stable id for this device, persisted across sessions. */
  deviceId: string;
  /** The calling application's version string. */
  version: string;
}

/**
 * Jellyfin's own header parser toggles a "we're inside a quoted value" flag on
 * every `"` it sees (no backslash-escape support), so a literal `"` inside a
 * field would desynchronize parsing for every field after it. Rather than emit
 * a header the server cannot parse — or throw on a field we don't fully
 * control, such as a user-edited device name — strip embedded quotes instead.
 */
function sanitizeField(value: string): string {
  return value.replace(/"/g, '');
}

/** Builds the `Authorization` header value for a Jellyfin request. `token` is
 * omitted for the pre-authentication login call and for any other request made
 * before a session exists. */
export function buildAuthorizationHeader(device: JellyfinDeviceInfo, token?: string): string {
  const parts = [
    `Client="${sanitizeField(device.client)}"`,
    `Device="${sanitizeField(device.device)}"`,
    `DeviceId="${sanitizeField(device.deviceId)}"`,
    `Version="${sanitizeField(device.version)}"`,
  ];
  if (token) {
    parts.push(`Token="${sanitizeField(token)}"`);
  }
  return `MediaBrowser ${parts.join(', ')}`;
}

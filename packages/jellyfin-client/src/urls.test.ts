import { describe, expect, it } from 'vitest';
import { buildImageUrl, buildStreamUrl } from './urls.js';

describe('buildStreamUrl', () => {
  it('builds a static direct-play stream URL with the token as ApiKey', () => {
    const url = buildStreamUrl('http://jellyfin.local:8096', 'item-1', 'tok-1');
    expect(url).toBe('http://jellyfin.local:8096/Audio/item-1/stream?static=true&ApiKey=tok-1');
  });

  it('respects an explicit static=false and an optional container/deviceId', () => {
    const url = buildStreamUrl('http://jellyfin.local:8096', 'item-1', 'tok-1', {
      static: false,
      container: 'mp3',
      deviceId: 'device-1',
    });
    expect(url).toBe(
      'http://jellyfin.local:8096/Audio/item-1/stream?static=false&container=mp3&deviceId=device-1&ApiKey=tok-1',
    );
  });

  it('URL-encodes the item id', () => {
    const url = buildStreamUrl('http://jellyfin.local:8096', 'a/b c', 'tok-1');
    expect(url).toContain('/Audio/a%2Fb%20c/stream');
  });

  it('preserves a reverse-proxy subpath on the base URL instead of dropping it', () => {
    // A naive `new URL(path, base)` join drops the base's path entirely for a
    // path starting with `/`, which would break a Jellyfin reverse-proxied
    // under e.g. http://host/jellyfin — this must not happen.
    const url = buildStreamUrl('http://host.local/jellyfin', 'item-1', 'tok-1');
    expect(url).toBe('http://host.local/jellyfin/Audio/item-1/stream?static=true&ApiKey=tok-1');
  });

  it('preserves a reverse-proxy subpath with a trailing slash on the base URL', () => {
    const url = buildStreamUrl('http://host.local/jellyfin/', 'item-1', 'tok-1');
    expect(url).toBe('http://host.local/jellyfin/Audio/item-1/stream?static=true&ApiKey=tok-1');
  });
});

describe('buildImageUrl', () => {
  it('builds a bare Primary image URL with the token as ApiKey', () => {
    const url = buildImageUrl('http://jellyfin.local:8096', 'item-1', 'tok-1');
    expect(url).toBe('http://jellyfin.local:8096/Items/item-1/Images/Primary?ApiKey=tok-1');
  });

  it('appends the requested transform and cache-tag params', () => {
    const url = buildImageUrl('http://jellyfin.local:8096', 'item-1', 'tok-1', {
      tag: 'abc123',
      maxWidth: 400,
      maxHeight: 400,
      quality: 90,
    });
    expect(url).toBe(
      'http://jellyfin.local:8096/Items/item-1/Images/Primary?tag=abc123&maxWidth=400&maxHeight=400&quality=90&ApiKey=tok-1',
    );
  });

  it('supports a non-Primary image type', () => {
    const url = buildImageUrl('http://jellyfin.local:8096', 'item-1', 'tok-1', {
      imageType: 'Backdrop',
    });
    expect(url).toContain('/Items/item-1/Images/Backdrop');
  });

  it('URL-encodes the item id', () => {
    const url = buildImageUrl('http://jellyfin.local:8096', 'a/b c', 'tok-1');
    expect(url).toContain('/Items/a%2Fb%20c/Images/Primary');
  });
});

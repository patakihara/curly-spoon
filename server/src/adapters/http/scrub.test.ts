import { describe, expect, it } from 'vitest';
import { type RawExchange, scrub } from './scrub.js';

const KEY = 'sk-9f8e7d6c5b4a/+=';
const baseUrl = 'http://100.64.12.34:13378';

function exchange(overrides: Partial<RawExchange> = {}): RawExchange {
  return {
    upstream: 'audiobookshelf',
    upstreamVersion: '2.36.1',
    call: 'library-list',
    request: {
      method: 'GET',
      url: `${baseUrl}/api/libraries`,
      headers: { accept: 'application/json', authorization: `Bearer ${KEY}` },
      body: null,
    },
    response: {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: { json: { libraries: [] } },
    },
    ...overrides,
  };
}

const opts = { secrets: [KEY], baseUrl };

describe('[M0.record/c] scrubbing a recording', () => {
  it('[M0.record/c] secrets are replaced wherever they appear, raw or URL-encoded', () => {
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: {
            json: {
              note: `key ${KEY} inline`,
              link: `/stream?x=${encodeURIComponent(KEY)}`,
            },
          },
        },
      }),
      opts,
    );
    const text = JSON.stringify(r);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(encodeURIComponent(KEY));
    expect(r.response.body).toEqual({
      json: { note: 'key <token> inline', link: '/stream?x=<token>' },
    });
  });

  it('[M0.record/c] the base URL becomes upstream.invalid in paths, bodies and headers', () => {
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: { 'content-type': `application/json; origin=${baseUrl}` },
          body: {
            json: {
              cover: `${baseUrl}/api/items/1/cover`,
              host: '100.64.12.34:13378',
              name: '100.64.12.34',
            },
          },
        },
      }),
      opts,
    );
    expect(r.request.path).toBe('/api/libraries');
    expect(r.response.headers['content-type']).toBe(
      'application/json; origin=http://upstream.invalid',
    );
    expect(r.response.body).toEqual({
      json: {
        cover: 'http://upstream.invalid/api/items/1/cover',
        host: 'upstream.invalid',
        name: 'upstream.invalid',
      },
    });
  });

  it('[M0.record/c] token-like query keys and body fields become <token>, booleans stay', () => {
    const r = scrub(
      exchange({
        request: {
          method: 'POST',
          url: `${baseUrl}/api/x?api_key=abc&ApiKey=def&token=ghi&limit=1`,
          headers: { 'content-type': 'application/json' },
          body: { json: { password: 'hunter2', rememberPassword: true, name: 'Auralis' } },
        },
        response: {
          status: 200,
          headers: {},
          body: {
            json: {
              user: { accessToken: 'abc', refreshToken: '', isTokenExpired: false, secret: null },
            },
          },
        },
      }),
      opts,
    );
    expect(r.request.query).toEqual({
      ApiKey: '<token>',
      api_key: '<token>',
      limit: '1',
      token: '<token>',
    });
    expect(r.request.body).toEqual({
      json: { password: '<token>', rememberPassword: true, name: 'Auralis' },
    });
    expect(r.response.body).toEqual({
      json: {
        user: { accessToken: '<token>', refreshToken: '', isTokenExpired: false, secret: null },
      },
    });
  });

  it("[M0.record/c] a sign-on's endpoints, token type and supported methods are described, not secret", () => {
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: {
            json: {
              token_endpoint: `${baseUrl}/api/oidc/token`,
              authorization_endpoint: `${baseUrl}/api/oidc/authorization`,
              token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
              token_endpoint_auth_signing_alg_values_supported: ['RS256', 'none'],
              token_type: 'bearer',
              access_token: 'at-0123456789',
              client_secret: 's3cret',
            },
          },
        },
      }),
      opts,
    );
    expect(r.response.body).toEqual({
      json: {
        token_endpoint: 'http://upstream.invalid/api/oidc/token',
        authorization_endpoint: 'http://upstream.invalid/api/oidc/authorization',
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
        token_endpoint_auth_signing_alg_values_supported: ['RS256', 'none'],
        token_type: 'bearer',
        access_token: '<token>',
        client_secret: '<token>',
      },
    });
  });

  it("[M0.record/c] a Jellyfin route under /Users is an API path, not someone's home folder", () => {
    const r = scrub(
      exchange({
        request: {
          method: 'POST',
          url: `${baseUrl}/Users/AuthenticateWithQuickConnect`,
          headers: {},
          body: null,
        },
        response: {
          status: 200,
          headers: {},
          body: { json: { Path: '/Users/someone/Music', Home: '/home/someone/x' } },
        },
      }),
      opts,
    );
    expect(r.request.path).toBe('/Users/AuthenticateWithQuickConnect');
    expect(r.response.body).toEqual({ json: { Path: '/Users/user/Music', Home: '/home/user/x' } });
  });

  it('[M0.record/c] IPv4 addresses outside loopback and the documentation ranges become 192.0.2.1', () => {
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: {
            json: {
              deviceInfo: { ipAddress: '10.1.2.3' },
              lan: 'seen from 192.168.1.20 and 127.0.0.1',
              doc: '198.51.100.7',
              serverVersion: '2.36.1',
            },
          },
        },
      }),
      opts,
    );
    expect(r.response.body).toEqual({
      json: {
        deviceInfo: { ipAddress: '192.0.2.1' },
        lan: 'seen from 192.0.2.1 and 127.0.0.1',
        doc: '198.51.100.7',
        serverVersion: '2.36.1',
      },
    });
  });

  it('[M0.record/c] an IPv4-mapped IPv6 address keeps its form with the IPv4 part replaced', () => {
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: {
            json: {
              deviceInfo: { ipAddress: '::ffff:100.101.102.103' },
              upper: '::FFFF:10.1.2.3',
              loopback: '::ffff:127.0.0.1',
            },
          },
        },
      }),
      opts,
    );
    expect(r.response.body).toEqual({
      json: {
        deviceInfo: { ipAddress: '::ffff:192.0.2.1' },
        upper: '::FFFF:192.0.2.1',
        loopback: '::ffff:127.0.0.1',
      },
    });
  });

  it('[M0.record/c] emails become user@upstream.invalid', () => {
    const r = scrub(
      exchange({
        response: { status: 200, headers: {}, body: { json: { email: 'someone@example.org' } } },
      }),
      opts,
    );
    expect(r.response.body).toEqual({ json: { email: 'user@upstream.invalid' } });
  });

  it("[M0.record/c] an image's blur hash is kept whole, though its alphabet holds @ and dots", () => {
    const hash = 'WA9s|ab@cd.ef:jk@lm.io:j[0JWB?bt7oLRkn}aeWYbIoyjsRjs';
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: {
            json: {
              ImageBlurHashes: { Primary: { '3d8e': hash, '9ae9': 'someone@example.org' } },
              Name: hash,
            },
          },
        },
      }),
      opts,
    );
    expect(r.response.body).toEqual({
      json: {
        ImageBlurHashes: { Primary: { '3d8e': hash, '9ae9': 'user@upstream.invalid' } },
        Name: 'WA9s|user@upstream.invalid:user@upstream.invalid:j[0JWB?bt7oLRkn}aeWYbIoyjsRjs',
      },
    });
  });

  it('[M0.record/c] only accept, content-type and authorization headers are kept', () => {
    const r = scrub(
      exchange({
        request: {
          method: 'GET',
          url: `${baseUrl}/api/libraries`,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${KEY}`,
            Cookie: 'connect.sid=abc',
            'X-Emby-Token': KEY,
          },
          body: null,
        },
        response: {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'connect.sid=abc',
            etag: 'W/"1"',
            'x-powered-by': 'Express',
          },
          body: null,
        },
      }),
      opts,
    );
    expect(r.request.headers).toEqual({
      accept: 'application/json',
      authorization: 'Bearer <token>',
    });
    expect(r.response.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('[M0.record/c] a MediaBrowser authorization header keeps its fields but not its token', () => {
    const r = scrub(
      exchange({
        request: {
          method: 'GET',
          url: `${baseUrl}/Library/MediaFolders`,
          headers: {
            authorization: `MediaBrowser Client="Auralis", Device="d", DeviceId="i", Version="0", Token="${KEY}"`,
          },
          body: null,
        },
      }),
      opts,
    );
    expect(r.request.headers.authorization).toBe(
      'MediaBrowser Client="Auralis", Device="d", DeviceId="i", Version="0", Token="<token>"',
    );
  });

  it('[M0.record/c] scrubbing twice gives the same recording', () => {
    const once = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: { json: { ip: '10.0.0.1', email: 'a@b.com', token: 'x', url: `${baseUrl}/a` } },
        },
      }),
      opts,
    );
    const { upstream, upstreamVersion, call, request, response } = once;
    const again = scrub(
      {
        upstream,
        upstreamVersion,
        call,
        request: {
          ...request,
          url: `http://upstream.invalid${request.path}`,
        },
        response,
      },
      opts,
    );
    expect(again).toEqual(once);
  });
});

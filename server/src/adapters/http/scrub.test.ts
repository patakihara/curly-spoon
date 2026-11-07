import { describe, expect, it } from 'vitest';
import { scanRecording } from './scan.js';
import { type RawExchange, SECRET_QUERY_KEY, scrub, scrubString } from './scrub.js';

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
  it("[M3.books] keeps a search's keywords, which only look like a key", () => {
    expect(SECRET_QUERY_KEY.test('keywords')).toBe(false);
    expect(SECRET_QUERY_KEY.test('apikey')).toBe(true);
    expect(SECRET_QUERY_KEY.test('key')).toBe(true);
  });

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

  it("[M0.record/c] only accept, content-type, authorization, user-agent, location and a range's headers are kept", () => {
    const r = scrub(
      exchange({
        request: {
          method: 'GET',
          url: `${baseUrl}/api/items/li_1/file/7`,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${KEY}`,
            Cookie: 'connect.sid=abc',
            'X-Emby-Token': KEY,
            Range: 'bytes=0-1',
            'User-Agent': 'Auralis/0.0.0 (+https://github.com/x/y)',
          },
          body: null,
        },
        response: {
          status: 206,
          headers: {
            'content-type': 'audio/mp4',
            'set-cookie': 'connect.sid=abc',
            etag: 'W/"1"',
            'x-powered-by': 'Express',
            'accept-ranges': 'bytes',
            'content-range': 'bytes 0-1/158919642',
            'content-length': '2',
            'last-modified': 'Sat, 02 May 2026 18:28:57 GMT',
          },
          body: null,
        },
      }),
      opts,
    );
    expect(r.request.headers).toEqual({
      accept: 'application/json',
      authorization: 'Bearer <token>',
      range: 'bytes=0-1',
      'user-agent': 'Auralis/0.0.0 (+https://github.com/x/y)',
    });
    expect(r.response.headers).toEqual({
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-1/158919642',
      'content-type': 'audio/mp4',
    });
  });

  it("[M3.books] a redirect's location is kept, with its secret query values scrubbed", () => {
    const out = scrub(
      exchange({
        response: {
          status: 301,
          headers: {
            location: `http://localhost:9696/a?apikey=${KEY}&file=b&x=1`,
            server: 'kept-out',
          },
          body: null,
        },
      }),
      { secrets: [], baseUrl },
    );
    expect(out.response.headers).toEqual({
      location: 'http://localhost:9696/a?apikey=<token>&file=b&x=1',
    });
  });

  it('[M3.books] a whole URL under a field ending in url keeps its path, losing only its key', () => {
    const out = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: { json: { downloadUrl: `http://localhost:9696/2/download?apikey=${KEY}&file=b` } },
        },
      }),
      { secrets: [KEY], baseUrl },
    );
    expect(out.response.body).toEqual({
      json: { downloadUrl: 'http://localhost:9696/2/download?apikey=<token>&file=b' },
    });
  });

  it('[M0.record/c] a body served from a committed stand-in file passes through as it is', () => {
    const bytes = { bytes: 'item-file.m4a', synthesized: 'a 20 s tone, not the real file' };
    const r = scrub(
      exchange({
        request: {
          method: 'GET',
          url: `${baseUrl}/api/items/li_1/file/7`,
          headers: {},
          body: null,
        },
        response: { status: 206, headers: {}, body: bytes },
      }),
      opts,
    );
    expect(r.response.body).toEqual(bytes);
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

describe("[M3.ytmusic] scrubbing a stream URL, which holds the household's address", () => {
  const ADDRESS = '85.76.1.2';
  const STREAM = `https://rr3---sn-5hne6n7s.googlevideo.com/videoplayback?expire=1&ei=abc&ip=${ADDRESS}&id=o-A&itag=251&mn=sn-5hne6n7s,sn-oxu8pnpvo-ovce&initcwndbps=8000&n=xyz&sig=AOq0&lsig=ALc&pot=Mn&sparams=expire,ip`;
  const YTDLP = (url: string) =>
    exchange({
      response: { status: 200, headers: {}, body: { json: { formats: [{ url, itag: 251 }] } } },
    });
  const scrubbedUrl = (recording: ReturnType<typeof scrub>) =>
    (recording.response.body as { json: { formats: { url: string }[] } }).json.formats[0]!.url;

  it('[M3.ytmusic] takes the address, the signatures and the cache nodes out, and keeps the rest', () => {
    const url = scrubbedUrl(scrub(YTDLP(STREAM), opts));
    expect(url).not.toContain(ADDRESS);
    const query = new URL(url).searchParams;
    for (const name of ['ip', 'ei', 'mn', 'n', 'sig', 'lsig', 'pot', 'initcwndbps']) {
      expect(query.get(name), name).toBe('<token>');
    }
    expect(query.get('itag')).toBe('251');
    expect(query.get('expire')).toBe('1');
    expect(query.get('sparams')).toBe('expire,ip');
  });

  it("[M3.ytmusic] rewrites the host, which names the ISP's cache node", () => {
    const url = scrubbedUrl(scrub(YTDLP(STREAM), opts));
    expect(new URL(url).hostname).toBe('rr0---sn-recorded.googlevideo.com');
    expect(url).not.toContain('5hne6n7s');
  });

  it('[M3.ytmusic] does the same for a stream URL asked directly', () => {
    const r = scrub(
      exchange({
        request: { method: 'GET', url: STREAM, headers: {}, body: null },
      }),
      { secrets: [], baseUrl: 'https://rr3---sn-5hne6n7s.googlevideo.com' },
    );
    expect(r.request.query.ip).toBe('<token>');
    expect(r.request.query.sig).toBe('<token>');
    expect(r.request.query.itag).toBe('251');
  });

  it('[M3.ytmusic] is idempotent, and what it leaves passes the scan', () => {
    const once = scrub(YTDLP(STREAM), opts);
    const twice = scrubString(scrubbedUrl(once));
    expect(twice).toBe(scrubbedUrl(once));
    expect(scanRecording(once)).toEqual([]);
  });

  it('[M3.ytmusic] leaves an `n` or an `ip` outside a stream URL alone: only there are they secret', () => {
    expect(scrubString('http://upstream.invalid/page?n=5&ip=no')).toBe(
      'http://upstream.invalid/page?n=5&ip=no',
    );
  });

  it('[M3.ytmusic] the address the recorder was given goes wherever it appears', () => {
    const r = scrub(
      exchange({
        response: {
          status: 200,
          headers: {},
          body: {
            json: { seenFrom: `from ${Buffer.from(ADDRESS).toString('base64')} or ${ADDRESS}` },
          },
        },
      }),
      { secrets: [ADDRESS], baseUrl },
    );
    const text = JSON.stringify(r);
    expect(text).not.toContain(ADDRESS);
    expect(text).not.toContain(Buffer.from(ADDRESS).toString('base64'));
  });

  describe('the scan, as the backstop', () => {
    const clean = () => scrub(YTDLP(STREAM), opts);
    const plant = (url: string) => {
      const r = clean();
      (r.response.body as { json: { formats: { url: string }[] } }).json.formats[0]!.url = url;
      return r;
    };

    it('[M3.ytmusic] fails on the planted address', () => {
      const r = plant(scrubbedUrl(clean()).replace('ip=<token>', `ip=${ADDRESS}`));
      expect(scanRecording(r).map((f) => f.kind)).toContain('ip');
    });

    it('[M3.ytmusic] fails on a signature left in a stream URL', () => {
      const r = plant(scrubbedUrl(clean()).replace('sig=<token>', 'sig=AOq0'));
      expect(scanRecording(r).map((f) => f.kind)).toContain('query-secret');
    });

    it("[M3.ytmusic] fails on a real cache node's host, and on its name alone", () => {
      expect(scanRecording(plant(STREAM)).map((f) => f.kind)).toContain('host');
      const named = plant('sn-5hne6n7s');
      expect(scanRecording(named).map((f) => f.kind)).toContain('host');
    });
  });
});

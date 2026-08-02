import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const validEnv = {
  SESSION_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('applies sensible defaults when only the required secret is set', () => {
    const config = loadConfig(validEnv);
    expect(config).toEqual({
      port: 8787,
      dataDir: './data',
      sessionSecret: 'a'.repeat(32),
      fakeUpstreams: false,
      nodeEnv: 'development',
      serveWeb: true,
      webDistDir: undefined,
    });
  });

  it('coerces PORT from a string env var', () => {
    const config = loadConfig({ ...validEnv, PORT: '4000' });
    expect(config.port).toBe(4000);
  });

  it('reads DATA_DIR and NODE_ENV', () => {
    const config = loadConfig({
      ...validEnv,
      DATA_DIR: '/var/lib/auralis',
      NODE_ENV: 'production',
    });
    expect(config.dataDir).toBe('/var/lib/auralis');
    expect(config.nodeEnv).toBe('production');
  });

  it('turns AURALIS_FAKE_UPSTREAMS=1 into fakeUpstreams:true', () => {
    expect(loadConfig({ ...validEnv, AURALIS_FAKE_UPSTREAMS: '1' }).fakeUpstreams).toBe(true);
    expect(loadConfig({ ...validEnv, AURALIS_FAKE_UPSTREAMS: '0' }).fakeUpstreams).toBe(false);
  });

  it('rejects a missing SESSION_SECRET with a clear, actionable message', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/SESSION_SECRET/);
  });

  it('rejects a SESSION_SECRET shorter than 32 characters', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'too-short' })).toThrow(/at least 32 characters/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => loadConfig({ ...validEnv, PORT: 'not-a-number' })).toThrow(ConfigError);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => loadConfig({ ...validEnv, PORT: '99999' })).toThrow(ConfigError);
  });

  it('rejects an invalid AURALIS_FAKE_UPSTREAMS value', () => {
    expect(() => loadConfig({ ...validEnv, AURALIS_FAKE_UPSTREAMS: 'yes' })).toThrow(ConfigError);
  });

  it('defaults AURALIS_SERVE_WEB to enabled', () => {
    expect(loadConfig(validEnv).serveWeb).toBe(true);
  });

  it('turns AURALIS_SERVE_WEB=0 into serveWeb:false', () => {
    expect(loadConfig({ ...validEnv, AURALIS_SERVE_WEB: '0' }).serveWeb).toBe(false);
  });

  it('reads an explicit WEB_DIST_DIR override', () => {
    expect(loadConfig({ ...validEnv, WEB_DIST_DIR: '/srv/web' }).webDistDir).toBe('/srv/web');
  });

  it('reports every issue at once rather than only the first', () => {
    try {
      loadConfig({ PORT: 'nope', SESSION_SECRET: 'short' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('PORT');
      expect((err as Error).message).toContain('SESSION_SECRET');
    }
  });
});

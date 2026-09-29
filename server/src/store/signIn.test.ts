import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { createDevice } from './devices.js';
import {
  APP_CODE_TTL_MS,
  issueAppCode,
  LOGIN_TTL_MS,
  s256,
  startLogin,
  takeAppCode,
  takeLogin,
} from './signIn.js';
import { sweepExpiredSessions } from './sessions.js';
import { upsertUser } from './users.js';

const T0 = 1_800_000_000_000;
let counter = 0;
const random = (n: number) => Buffer.alloc(n, ++counter);
const web = {
  client: 'web' as const,
  returnTo: '/',
  appChallenge: null,
  appState: null,
  deviceId: null,
};

describe('[M0.sso/b] a sign-in in flight', () => {
  it('makes distinct state, nonce and verifier, and hands the request back once', () => {
    const db = openDatabase(':memory:');
    const started = startLogin(db, web, random, T0);
    expect(new Set([started.state, started.nonce, started.verifier]).size).toBe(3);
    expect(takeLogin(db, started.state, started.binding ?? undefined, T0 + 1)).toEqual(started);
    expect(takeLogin(db, started.state, started.binding ?? undefined, T0 + 2)).toBeNull();
  });

  it("refuses a web sign-in without its own browser's binding, and burns the state", () => {
    const db = openDatabase(':memory:');
    const started = startLogin(db, web, random, T0);
    const other = startLogin(db, web, random, T0);
    expect(takeLogin(db, started.state, other.binding ?? undefined, T0 + 1)).toBeNull();
    expect(takeLogin(db, started.state, started.binding ?? undefined, T0 + 2)).toBeNull();
    expect(takeLogin(db, other.state, undefined, T0 + 3)).toBeNull();
  });

  it('binds an app sign-in by its PKCE challenge, with no browser binding', () => {
    const db = openDatabase(':memory:');
    const app = {
      client: 'android' as const,
      returnTo: '/',
      appChallenge: 'c',
      appState: null,
      deviceId: null,
    };
    const started = startLogin(db, app, random, T0);
    expect(started.binding).toBeNull();
    expect(takeLogin(db, started.state, undefined, T0 + 1)).toEqual(started);
  });

  it("keeps the app's own state, to hand back to the app with its code", () => {
    const db = openDatabase(':memory:');
    const app = {
      client: 'android' as const,
      returnTo: '/',
      appChallenge: 'c',
      appState: 'the-apps-own-state',
      deviceId: null,
    };
    const started = startLogin(db, app, random, T0);
    expect(takeLogin(db, started.state, undefined, T0 + 1)?.appState).toBe('the-apps-own-state');
  });

  it('stores only a hash of the state and of the binding', () => {
    const db = openDatabase(':memory:');
    const { state, binding } = startLogin(db, web, random, T0);
    const stored = JSON.stringify(db.prepare('SELECT * FROM login_requests').all());
    expect(stored).not.toContain(state);
    expect(stored).not.toContain(String(binding));
  });

  it('expires after ten minutes, and is swept', () => {
    const db = openDatabase(':memory:');
    const late = startLogin(db, web, random, T0);
    expect(takeLogin(db, late.state, late.binding ?? undefined, T0 + LOGIN_TTL_MS)).toBeNull();
    startLogin(db, web, random, T0);
    expect(sweepExpiredSessions(db, T0 + LOGIN_TTL_MS)).toBe(1);
  });
});

describe('[M0.sso/b] the one-time app code', () => {
  function withDevice() {
    const db = openDatabase(':memory:');
    const user = upsertUser(db, { username: 'kara', role: 'member' });
    const device = createDevice(db, { userId: user.id, kind: 'android' });
    return { db, user, device };
  }
  const verifier = 'app-verifier-0123456789-0123456789-0123456789';

  it('signs in the app that holds the verifier, once', () => {
    const { db, user, device } = withDevice();
    const code = issueAppCode(
      db,
      { userId: user.id, deviceId: device.id, appChallenge: s256(verifier) },
      random,
      T0,
    );
    expect(takeAppCode(db, code, verifier, T0 + 1)).toEqual({
      userId: user.id,
      deviceId: device.id,
    });
    expect(takeAppCode(db, code, verifier, T0 + 2)).toBeNull();
  });

  it('refuses a wrong verifier, and the code is gone after it', () => {
    const { db, user, device } = withDevice();
    const params = { userId: user.id, deviceId: device.id, appChallenge: s256(verifier) };
    const code = issueAppCode(db, params, random, T0);
    expect(takeAppCode(db, code, 'someone-elses-verifier', T0 + 1)).toBeNull();
    expect(takeAppCode(db, code, verifier, T0 + 2)).toBeNull();
  });

  it('lasts sixty seconds', () => {
    const { db, user, device } = withDevice();
    const params = { userId: user.id, deviceId: device.id, appChallenge: s256(verifier) };
    const code = issueAppCode(db, params, random, T0);
    expect(takeAppCode(db, code, verifier, T0 + APP_CODE_TTL_MS)).toBeNull();
  });
});

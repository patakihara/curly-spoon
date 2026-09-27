/**
 * Signing in through the recorded household sign-on. Waits on the recordings: the sign-on's
 * `oidc/recordings/{discovery,jwks,token,userinfo}.json`, Audiobookshelf's
 * `audiobookshelf/recordings/{users-list,api-key-create}.json` and Jellyfin's
 * `jellyfin/recordings/{users-list,quick-connect-initiate,quick-connect-authorize,
 * quick-connect-authenticate}.json`, with the recorder's saved state, nonce, verifier and time.
 */
import { describe, it } from 'vitest';

describe('[M0.sso/a] signing in through the recorded sign-on', () => {
  it.todo(
    'redirects to the sign-on with the recorded state, sets a cookie at the callback, and /auth/me is the test identity',
  );
  it.todo(
    'links the recorded Audiobookshelf and Jellyfin user ids, whose tokens decrypt to the recorded ones',
  );
  it.todo('refuses a reused state with 400, and makes no user');
  it.todo(
    'refuses the recorded ID token re-signed with another nonce, audience or issuer with 400, and makes no user',
  );
  it.todo('mints the Audiobookshelf key with the recorded users-list and api-key-create answers');
  it.todo('mints the Jellyfin token with the recorded users-list and three Quick Connect answers');
});

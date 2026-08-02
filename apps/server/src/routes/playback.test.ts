import { describe, expect, it } from 'vitest';
import { buildTestApp, loginTestUser } from '../testSupport/buildTestApp.js';
import { FAKE_PODCAST_ITEM_ID } from '../../test/fakes/fakeAbs.js';

describe('POST /api/v1/items/:id/play', () => {
  it('requires authentication', async () => {
    const { app } = buildTestApp();
    const response = await app.inject({ method: 'POST', url: '/api/v1/items/item-dune/play' });
    expect(response.statusCode).toBe(401);
  });

  it('starts a book playback session with normalised audio tracks', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/items/item-dune/play',
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { session } = response.json();
    expect(session.libraryItemId).toBe('item-dune');
    expect(session.audioTracks).toHaveLength(2);
  });
});

describe('POST /api/v1/items/:itemId/play/:episodeId', () => {
  it('starts a podcast episode playback session', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/items/${FAKE_PODCAST_ITEM_ID}/play/ep-dailytech-1`,
      cookies: { auralis_session: cookie },
    });

    expect(response.statusCode).toBe(200);
    const { session } = response.json();
    expect(session.episodeId).toBe('ep-dailytech-1');
    expect(session.mediaType).toBe('podcast');
  });
});

describe('POST /api/v1/sessions/:id/sync and /close', () => {
  it('syncs progress against the session and then closes it', async () => {
    const { app, fake } = buildTestApp();
    const cookie = await loginTestUser(app);

    const play = await app.inject({
      method: 'POST',
      url: '/api/v1/items/item-dune/play',
      cookies: { auralis_session: cookie },
    });
    const sessionId = play.json().session.id as string;

    const sync = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/sync`,
      cookies: { auralis_session: cookie },
      payload: { currentTime: 42, timeListened: 42, duration: 1260 },
    });
    expect(sync.statusCode).toBe(200);
    expect(fake.getSessionCurrentTime(sessionId)).toBe(42);

    const close = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/close`,
      cookies: { auralis_session: cookie },
    });
    expect(close.statusCode).toBe(200);

    // Syncing a closed session no longer resolves to a real session upstream.
    const syncAfterClose = await app.inject({
      method: 'POST',
      url: `/api/v1/sessions/${sessionId}/sync`,
      cookies: { auralis_session: cookie },
      payload: { currentTime: 99, timeListened: 99, duration: 1260 },
    });
    expect(syncAfterClose.statusCode).toBe(404);
  });

  it('rejects a malformed sync body', async () => {
    const { app } = buildTestApp();
    const cookie = await loginTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sessions/sess-1/sync',
      cookies: { auralis_session: cookie },
      payload: { currentTime: 'nope' },
    });
    expect(response.statusCode).toBe(400);
  });
});

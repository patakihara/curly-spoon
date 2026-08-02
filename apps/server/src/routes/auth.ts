import type { FastifyInstance } from 'fastify';
import { isAbsError } from '@auralis/abs-client';
import { getSettings } from '../db/settingsRepo.js';
import { completeLogin, endSession } from '../auth/sessionService.js';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth/cookies.js';
import { createRequireSession } from '../auth/requireSession.js';
import { createRateLimitHook } from '../auth/rateLimitHook.js';
import { handleUpstreamError, sendError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { loginBodySchema } from './schemas.js';

export function registerAuthRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');
  const rateLimitLogin = createRateLimitHook(app.loginRateLimiter);
  const cookieSecure = app.config.nodeEnv === 'production';

  app.post('/auth/login', { preHandler: rateLimitLogin }, async (request, reply) => {
    const body = parseInput(reply, loginBodySchema, request.body);
    if (!body) return;

    const settings = getSettings(app.db);
    if (!settings) {
      sendError(reply, 409, 'not_configured', 'Audiobookshelf connection has not been configured yet');
      return;
    }

    try {
      const client = app.abs.forSetup(settings.baseUrl);
      const loginResult = await client.login(body.username, body.password);
      const session = completeLogin(app.db, app.config.sessionSecret, loginResult);

      reply.setCookie(
        SESSION_COOKIE_NAME,
        session.token,
        sessionCookieOptions(cookieSecure, session.expiresAt - Date.now()),
      );
      reply.send({ user: { id: session.userId, username: session.username } });
    } catch (err) {
      if (isAbsError(err) && err.code === 'auth') {
        sendError(reply, 401, 'invalid_credentials', 'Incorrect username or password');
        return;
      }
      handleUpstreamError(reply, err);
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) endSession(app.db, token);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: requireSession }, async (request, reply) => {
    try {
      const client = app.abs.forUser(request.userId!);
      const me = await client.getMe();
      reply.send({ user: me });
    } catch (err) {
      handleUpstreamError(reply, err);
    }
  });
}

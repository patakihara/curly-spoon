import type { FastifyInstance } from 'fastify';
import { getSettings, setSettings } from '../db/settingsRepo.js';
import { handleUpstreamError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import { setupBodySchema } from './schemas.js';

export function registerSetupRoutes(app: FastifyInstance): void {
  app.get('/setup', async (_request, reply) => {
    const settings = getSettings(app.db);
    reply.send({ configured: settings !== null, baseUrl: settings?.baseUrl ?? null });
  });

  app.post('/setup', async (request, reply) => {
    const body = parseInput(reply, setupBodySchema, request.body);
    if (!body) return;

    try {
      const client = app.abs.forSetup(body.baseUrl);
      const probe = await client.probe();
      const settings = setSettings(app.db, body.baseUrl);
      reply.send({ configured: true, baseUrl: settings.baseUrl, serverVersion: probe.serverVersion });
    } catch (err) {
      // A failed probe here is intentionally not persisted — a typo'd URL should
      // never overwrite a previously-working configuration.
      handleUpstreamError(reply, err);
    }
  });
}

import type { FastifyInstance } from 'fastify';
import { getSettings } from '../db/settingsRepo.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  // Deliberately unauthenticated and always 200: this route reports on the app's and
  // upstream's health, it isn't itself a thing that can be "down" from the caller's
  // perspective as long as the process is answering requests at all.
  app.get('/health', async (request, reply) => {
    const settings = getSettings(app.db);
    if (!settings) {
      return reply.send({ status: 'ok', upstream: { configured: false, reachable: false } });
    }

    try {
      const client = app.abs.forSetup(settings.baseUrl);
      const probe = await client.probe();
      return reply.send({
        status: 'ok',
        upstream: { configured: true, reachable: true, serverVersion: probe.serverVersion },
      });
    } catch (err) {
      request.log.warn({ err }, 'upstream health probe failed');
      return reply.send({ status: 'ok', upstream: { configured: true, reachable: false } });
    }
  });
}

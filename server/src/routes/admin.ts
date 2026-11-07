import { listJobs, listUsers as listUsersRoute, runJob } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { Music } from '../music/index.js';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { listUsers } from '../store/users.js';

export function adminRoutes(app: FastifyInstance, options: { db: Db; music?: Music | null }): void {
  const music = options.music ?? null;

  serve(app, listUsersRoute, () => ({
    users: listUsers(options.db).map((user) => ({ username: user.username, role: user.role })),
  }));

  serve(app, listJobs, () => {
    if (music === null) return { jobs: [] };
    const { versions, ...job } = music.job();
    return {
      jobs: [
        {
          name: 'extractor' as const,
          ...job,
          versions: versions.map((row) => ({
            version: row.version,
            source: row.source,
            state: row.state,
            canaryAt: row.canary_at,
            canaryMs: row.canary_ms,
            tier: row.tier,
            reason: row.reason,
          })),
        },
      ],
    };
  });

  serve(app, runJob, () => {
    if (music !== null) {
      void music.runNow().catch((err: unknown) => app.log.error({ err }, 'job failed'));
    }
    return { ok: true };
  });
}

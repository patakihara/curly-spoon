import { listUsers as listUsersRoute } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { listUsers } from '../store/users.js';

export function adminRoutes(app: FastifyInstance, options: { db: Db }): void {
  serve(app, listUsersRoute, () => ({
    users: listUsers(options.db).map((user) => ({ username: user.username, role: user.role })),
  }));
}

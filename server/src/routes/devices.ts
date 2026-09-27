/** Each user lists, renames and removes only their own devices; another's id reads as missing. */

import { deleteDevice, listDevices, renameDevice } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { clearSessionCookie } from '../auth/cookie.js';
import type { CookieSecure } from '../config.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import * as devices from '../store/devices.js';
import { signedIn } from './auth.js';

function view(device: devices.Device, currentId: string) {
  return {
    id: device.id,
    kind: device.kind,
    name: device.name,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    current: device.id === currentId,
  };
}

export function deviceRoutes(
  app: FastifyInstance,
  options: { db: Db; cookieSecure: CookieSecure },
): void {
  const { db, cookieSecure } = options;

  serve(app, listDevices, (request) => {
    const user = signedIn(request);
    return { devices: devices.listDevices(db, user.id).map((d) => view(d, user.deviceId)) };
  });

  serve(app, renameDevice, (request, _reply, body, { params }) => {
    const user = signedIn(request);
    const renamed = devices.renameDevice(db, user.id, params.id, body.name);
    if (renamed === null) throw new Refusal(404, 'not_found');
    return view(renamed, user.deviceId);
  });

  serve(app, deleteDevice, (request, reply, _body, { params }) => {
    const user = signedIn(request);
    if (!devices.deleteDevice(db, user.id, params.id)) throw new Refusal(404, 'not_found');
    if (params.id === user.deviceId) clearSessionCookie(request, reply, cookieSecure);
    return { ok: true };
  });
}

/**
 * Listening sessions and their queues, for the signed-in person's own device only: every queue
 * route reads and changes the calling device's session, and the session list shows only the
 * caller's own devices, so another person's device is never reachable. A change naming a `rev`
 * that is not the session's answers 409 `stale_revision`.
 */
import {
  addToQueue,
  getQueue,
  listSessions,
  putQueue,
  type QueueItem,
  setActiveQueue,
  setQueueStyle,
  stepSession,
} from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { add, queueFor, setQueueStyle as styled, step, switchTo } from '../queues/engine.js';
import type { Sessions } from '../queues/sessions.js';
import { Refusal, serve } from '../route.js';
import type { SessionItem } from '../store/listening.js';
import { signedIn } from './auth.js';

/** An entry moved into playing-from: what only your queue keeps is left behind. */
const contextItem = ({ itemId, ref, chapter }: SessionItem): QueueItem => ({
  itemId,
  ref,
  ...(chapter === undefined ? {} : { chapter }),
});

export function sessionRoutes(app: FastifyInstance, options: { sessions: Sessions }): void {
  const { sessions } = options;

  serve(app, listSessions, (request) => ({ sessions: sessions.list(signedIn(request)) }));

  serve(app, getQueue, (request, _reply, _body, { params }) =>
    sessions.queue(signedIn(request), params.type),
  );

  serve(app, putQueue, (request, _reply, body, { params }) => {
    const saved = sessions.change(signedIn(request), body.rev, (s) => {
      const q = s.queues[params.type];
      const entries = new Map(
        [...q.user, ...(q.context?.items ?? [])].map((item) => [item.itemId, item]),
      );
      const named = [...body.user, ...body.context];
      if (new Set(named).size !== named.length || named.some((id) => !entries.has(id))) {
        throw new Refusal(400, 'unknown_item');
      }
      if (q.context === null && body.context.length > 0) throw new Refusal(400, 'unknown_item');
      q.user = body.user.map((id) => entries.get(id)!);
      if (q.context !== null)
        q.context.items = body.context.map((id) => contextItem(entries.get(id)!));
      return s;
    });
    return sessions.queueOf(saved, params.type);
  });

  serve(app, addToQueue, async (request, _reply, body, { params }) => {
    const caller = signedIn(request);
    await sessions.load(caller, [body.ref]);
    const expansion = sessions.deps.expand(body.ref);
    if (expansion === null || expansion.entries.length === 0) throw new Refusal(404, 'not_found');
    if (queueFor(expansion.kind) !== params.type) throw new Refusal(400, 'wrong_queue');
    const saved = sessions.change(caller, body.rev, (s) => {
      const added = add(s, body.ref, body.how, sessions.deps);
      if (added === null) throw new Refusal(404, 'not_found');
      return added;
    });
    return sessions.queueOf(saved, params.type);
  });

  serve(app, stepSession, async (request, _reply, body) => {
    const caller = signedIn(request);
    // A Next at a queue's end plays autoplay's pick, so it waits for one being worked out.
    if (body.direction === 'next') await sessions.beforeNext(caller);
    sessions.change(caller, body.rev, (s) => step(s, body.direction, sessions.deps));
    return sessions.summary(caller);
  });

  serve(app, setActiveQueue, (request, _reply, body) => {
    const caller = signedIn(request);
    sessions.change(caller, body.rev, (s) => switchTo(s, body.queue, sessions.deps));
    return sessions.summary(caller);
  });

  serve(app, setQueueStyle, (request, _reply, body) => {
    const caller = signedIn(request);
    sessions.change(caller, body.rev, (s) => styled(s, body.queueStyle));
    return sessions.summary(caller);
  });
}

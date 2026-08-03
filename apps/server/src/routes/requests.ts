/**
 * Book request routes — search indexers, ask for a book, watch it download, and manage
 * the indexer/download-client providers and settings the pipeline runs on.
 *
 * Registered from `routes/index.ts` from the phase-6 scaffold onwards so the composition
 * root never has to change again as the handlers land.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { createRequireSession } from '../auth/requireSession.js';
import { sendError } from '../httpErrors.js';
import { parseInput } from '../validation.js';
import {
  createRequestBodySchema,
  idParamSchema,
  listRequestsQuerySchema,
  providerConfigBodySchema,
  requestSettingsBodySchema,
  searchReleasesQuerySchema,
} from './schemas.js';
import { deleteRequest, getRequest, listRequests } from '../db/requestsRepo.js';
import {
  deleteProviderConfig,
  getProviderConfig,
  listProviderConfigs,
  setProviderConfig,
} from '../db/providerConfigRepo.js';
import {
  APP_SETTING_KEYS,
  getApprovalPolicy,
  getBookCategory,
  getBookSavePath,
  setAppSetting,
} from '../db/appSettingsRepo.js';
import { RequestNotFoundError, RequestTransitionError } from '../requests/requestService.js';
import { getIndexerFactory, describeIndexers } from '../requests/indexers/registry.js';
import {
  getDownloadClientFactory,
  describeDownloadClients,
} from '../requests/download/registry.js';
import {
  ProviderError,
  type ProviderErrorKind,
  type ProviderDescriptor,
  type ResolvedProviderConfig,
} from '../requests/types.js';

/** Maps the two request-pipeline errors the route layer must translate itself; anything
 * else is rethrown so Fastify's own error handler produces a 500. Returns `true` when it
 * handled (and already sent) the error. */
function handleRequestError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof RequestNotFoundError) {
    sendError(reply, 404, 'not_found', err.message);
    return true;
  }
  if (err instanceof RequestTransitionError) {
    sendError(
      reply,
      409,
      'invalid_transition',
      `cannot move a request from "${err.from}" to "${err.to}"`,
    );
    return true;
  }
  return false;
}

const PROVIDER_ERROR_STATUS: Record<ProviderErrorKind, number> = {
  unauthorized: 401,
  unreachable: 502,
  not_found: 404,
  rejected: 400,
  bad_response: 400,
};

const PROVIDER_ERROR_CODE: Record<ProviderErrorKind, string> = {
  unauthorized: 'provider_unauthorized',
  unreachable: 'provider_unreachable',
  not_found: 'provider_not_found',
  rejected: 'provider_rejected',
  bad_response: 'provider_rejected',
};

/** Every descriptor this build knows, indexers and download clients combined — one entry
 * per descriptor, so `GET /providers` can list a provider nobody has configured yet. */
function allDescriptors(): ProviderDescriptor[] {
  return [...describeIndexers(), ...describeDownloadClients()];
}

function findDescriptor(id: string): ProviderDescriptor | null {
  return allDescriptors().find((d) => d.id === id) ?? null;
}

/** The `GET`/`PUT /providers` response shape — the descriptor's static facts plus what is
 * actually stored, and never the secret itself (see `assembleSecret` for why that never
 * gets close to this function in the first place). */
function toProviderEntry(descriptor: ProviderDescriptor, config: ResolvedProviderConfig | null) {
  return {
    id: descriptor.id,
    displayName: descriptor.displayName,
    kind: descriptor.kind,
    requiresBaseUrl: descriptor.requiresBaseUrl,
    requiresSecret: descriptor.requiresSecret,
    secretFields: descriptor.secretFields,
    summary: descriptor.summary,
    configured: config !== null,
    enabled: config?.enabled ?? false,
    baseUrl: config?.baseUrl ?? null,
    hasSecret: config !== null && config.secret !== null,
  };
}

/**
 * Turns a `PUT /providers/:id` body's `secret` object into the single string
 * `setProviderConfig` stores — this assembly is deliberately the route layer's job, not
 * the provider's, because providers disagree about what "a secret" is: `prowlarr.ts` reads
 * `config.secret` verbatim (one API key), while `qbittorrent.ts` `JSON.parse`s it (a
 * username and a password). Getting this convention wrong here breaks authentication for
 * every provider built from it, not just one.
 *
 * - `secretBody` absent → `undefined`, meaning "leave the stored secret alone" (what lets
 *   a settings form show a masked placeholder and submit without re-typing it).
 * - Otherwise, only the keys `descriptor.secretFields` actually declares are looked at —
 *   an unrelated key in the body is silently ignored, never stored.
 * - If every value among those known keys is `''` (including the vacuous case of zero
 *   known keys at all — `Array.prototype.every` on `[]` is `true`), the secret is cleared
 *   (`null`).
 * - Exactly one known key with a non-empty value → stored as that raw string (matches
 *   `prowlarr.ts`).
 * - Two or more → stored as `JSON.stringify` of `{ key: value, ... }` (matches
 *   `qbittorrent.ts`).
 */
function assembleSecret(
  descriptor: ProviderDescriptor,
  secretBody: Record<string, string> | undefined,
): string | null | undefined {
  if (secretBody === undefined) return undefined;

  const known = descriptor.secretFields
    .map((field) => field.key)
    .filter((key) => secretBody[key] !== undefined);

  if (known.every((key) => secretBody[key] === '')) return null;

  if (known.length === 1) {
    const key = known[0]!;
    const value = secretBody[key];
    // `known` was filtered to keys present in `secretBody`, so this is always a string —
    // narrowed explicitly rather than trusting the index signature, since a widened
    // `string | undefined` here would let `undefined` leak out and be mistaken for "keep
    // the stored secret".
    if (value === undefined) return null;
    return value;
  }

  const assembled: Record<string, string> = {};
  for (const key of known) {
    const value = secretBody[key];
    if (value !== undefined) assembled[key] = value;
  }
  return JSON.stringify(assembled);
}

export function registerRequestRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  // -----------------------------------------------------------------------------
  // Requests
  // -----------------------------------------------------------------------------

  // Must be registered before `/requests/:id` — Fastify's router prioritises static
  // segments over parametric ones regardless of registration order, but the route stays
  // here, above the id routes, so nobody has to rediscover that invariant by breaking it.
  // `requests.test.ts` pins the behaviour this depends on.
  app.get('/requests/search', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, searchReleasesQuerySchema, request.query);
    if (!query) return undefined;
    const outcome = await app.requests.searchReleases({
      term: query.term,
      author: query.author,
      limit: query.limit,
    });
    return reply.send({ releases: outcome.releases, errors: outcome.errors });
  });

  app.get('/requests', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, listRequestsQuerySchema, request.query);
    if (!query) return undefined;
    const requests = listRequests(app.db, query.status ? { status: query.status } : {});
    return reply.send({ requests });
  });

  app.post('/requests', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, createRequestBodySchema, request.body);
    if (!body) return undefined;
    const created = app.requests.createRequest({
      userId: request.userId!,
      title: body.title,
      author: body.author,
      release: body.release,
    });
    return reply.code(201).send({ request: created });
  });

  app.get('/requests/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    const found = getRequest(app.db, params.id);
    if (!found) {
      sendError(reply, 404, 'not_found', `request "${params.id}" not found`);
      return undefined;
    }
    return reply.send({ request: found });
  });

  app.post('/requests/:id/approve', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      return reply.send({ request: app.requests.approve(params.id) });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  app.post('/requests/:id/reject', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      return reply.send({ request: app.requests.reject(params.id) });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  // "Try again": `retry()` alone only resets the status back to `searching` and clears the
  // old failure detail — it does not itself go looking for a release. `grab()` is what
  // actually drives the pipeline forward, so the user-facing retry is both, in sequence.
  app.post('/requests/:id/retry', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      app.requests.retry(params.id);
      const grabbed = await app.requests.grab(params.id);
      return reply.send({ request: grabbed });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  app.post('/requests/:id/grab', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    try {
      const grabbed = await app.requests.grab(params.id);
      return reply.send({ request: grabbed });
    } catch (err) {
      if (!handleRequestError(reply, err)) throw err;
      return undefined;
    }
  });

  app.delete('/requests/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    if (!getRequest(app.db, params.id)) {
      sendError(reply, 404, 'not_found', `request "${params.id}" not found`);
      return undefined;
    }
    deleteRequest(app.db, params.id);
    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------------
  // Providers (indexers, download clients)
  // -----------------------------------------------------------------------------

  app.get('/providers', { preHandler: requireSession }, async (_request, reply) => {
    const configs = listProviderConfigs(app.db, app.config.sessionSecret);
    const configById = new Map(configs.map((config) => [config.id, config]));
    const providers = allDescriptors().map((descriptor) =>
      toProviderEntry(descriptor, configById.get(descriptor.id) ?? null),
    );
    return reply.send({ providers });
  });

  app.put('/providers/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    const body = parseInput(reply, providerConfigBodySchema, request.body);
    if (!params || !body) return undefined;

    const descriptor = findDescriptor(params.id);
    if (!descriptor) {
      sendError(reply, 400, 'unknown_provider', `no provider descriptor for "${params.id}"`);
      return undefined;
    }

    const existing = getProviderConfig(app.db, params.id, app.config.sessionSecret);
    const secret = assembleSecret(descriptor, body.secret);

    const saved = setProviderConfig(
      app.db,
      {
        id: descriptor.id,
        // `kind` always comes from the descriptor, never the request body — a client must
        // not be able to file an indexer's config as a download client's, or vice versa.
        kind: descriptor.kind,
        enabled: body.enabled ?? existing?.enabled ?? false,
        baseUrl: body.baseUrl !== undefined ? body.baseUrl : (existing?.baseUrl ?? null),
        options: body.options !== undefined ? body.options : (existing?.options ?? {}),
        secret,
      },
      app.config.sessionSecret,
    );

    return reply.send(toProviderEntry(descriptor, saved));
  });

  app.post('/providers/:id/test', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;

    const descriptor = findDescriptor(params.id);
    if (!descriptor) {
      sendError(reply, 400, 'unknown_provider', `no provider descriptor for "${params.id}"`);
      return undefined;
    }

    const config = getProviderConfig(app.db, params.id, app.config.sessionSecret);
    if (!config) {
      sendError(
        reply,
        400,
        'provider_not_configured',
        `provider "${params.id}" has no stored configuration`,
      );
      return undefined;
    }

    const factory =
      descriptor.kind === 'indexer'
        ? getIndexerFactory(params.id)
        : getDownloadClientFactory(params.id);
    if (!factory) {
      sendError(
        reply,
        400,
        'provider_unknown',
        `no factory registered for provider "${params.id}"`,
      );
      return undefined;
    }

    // Built straight from the stored config, bypassing the `enabled` gate `RequestService`
    // applies to `listIndexers`/`getDownloadClient` — a user must be able to verify
    // credentials before flipping a provider on. See the `upstreamFetch` doc comment in
    // app.ts for why that requires the raw fetch rather than going through `app.requests`.
    const provider = factory({ config, fetch: app.upstreamFetch });

    try {
      await provider.testConnection();
      return reply.send({ ok: true });
    } catch (err) {
      if (err instanceof ProviderError) {
        sendError(
          reply,
          PROVIDER_ERROR_STATUS[err.kind],
          PROVIDER_ERROR_CODE[err.kind],
          err.message,
        );
        return undefined;
      }
      throw err;
    }
  });

  app.delete('/providers/:id', { preHandler: requireSession }, async (request, reply) => {
    const params = parseInput(reply, idParamSchema, request.params);
    if (!params) return undefined;
    deleteProviderConfig(app.db, params.id);
    return reply.code(204).send();
  });

  // -----------------------------------------------------------------------------
  // Request-pipeline settings
  // -----------------------------------------------------------------------------

  app.get('/settings/requests', { preHandler: requireSession }, async (_request, reply) => {
    return reply.send({
      approvalPolicy: getApprovalPolicy(app.db),
      bookSavePath: getBookSavePath(app.db),
      bookCategory: getBookCategory(app.db),
    });
  });

  app.put('/settings/requests', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, requestSettingsBodySchema, request.body);
    if (!body) return undefined;

    if (body.approvalPolicy !== undefined) {
      setAppSetting(app.db, APP_SETTING_KEYS.approvalPolicy, body.approvalPolicy);
    }
    if (body.bookSavePath !== undefined) {
      setAppSetting(app.db, APP_SETTING_KEYS.bookSavePath, body.bookSavePath ?? '');
    }
    if (body.bookCategory !== undefined) {
      setAppSetting(app.db, APP_SETTING_KEYS.bookCategory, body.bookCategory ?? '');
    }

    return reply.send({
      approvalPolicy: getApprovalPolicy(app.db),
      bookSavePath: getBookSavePath(app.db),
      bookCategory: getBookCategory(app.db),
    });
  });
}

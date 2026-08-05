/**
 * A minimal, in-memory fake of the slskd REST API surface `requests/music/slskd.ts` uses —
 * `X-API-Key` auth, the async search pair (`POST /searches`, `GET /searches/{id}`,
 * `GET /searches/{id}/responses`), download enqueue/status/remove
 * (`POST /transfers/downloads/batches`, `GET`/`DELETE
 * /transfers/downloads/{username}/{id}`), and `GET /application` for `testConnection`.
 * Mirrors `fakeJellyfin.ts`'s shape: a `fetch`-compatible function keyed by a distinct base
 * URL, so `buildTestApp.ts`'s `providerFetch` hook (or a test-local composition of it) can
 * route by origin — no real socket.
 *
 * Field names are camelCase, matching `slskd.ts`'s documented (framework-default, not
 * upstream-confirmed) assumption about slskd's own JSON casing — see that file's header
 * comment.
 *
 * Lives under `testSupport/fakes/`, not a sibling `test/`, for the same reason `fakeAbs.ts`
 * and `fakeJellyfin.ts` do: `AURALIS_FAKE_UPSTREAMS` is a runtime flag the shipped server
 * can parse at boot (`main.ts`), and a `test/` directory does not ship in the Docker image.
 * This fake is not yet wired into `main.ts`'s dev-mode routing — only route tests use it
 * today — but living here keeps that follow-up a one-line addition rather than a move.
 */

import type { FetchLike } from '@auralis/abs-client';

export const FAKE_SLSKD_BASE_URL = 'http://fake.slskd.local';
export const FAKE_SLSKD_API_KEY = 'test-slskd-api-key-do-not-reuse';

export interface FakeSlskdSearchFile {
  filename: string;
  size: number;
  bitRate?: number | null;
  extension?: string | null;
}

export interface FakeSlskdSearchResponse {
  username: string;
  queueLength?: number;
  uploadSpeed?: number;
  hasFreeUploadSlot?: boolean;
  files: FakeSlskdSearchFile[];
}

interface FakeSearch {
  id: string;
  /** Number of `GET /searches/{id}` calls that still report `InProgress` before this
   * search flips to `Completed` — lets a test exercise the polling loop itself, not just
   * its terminal read. */
  incompletePollsRemaining: number;
  responses: FakeSlskdSearchResponse[];
}

interface FakeTransfer {
  id: string;
  username: string;
  filename: string;
  size: number;
  state: string;
  bytesTransferred: number;
  averageSpeed: number;
  exception: string | null;
}

export interface FakeSlskdUpstream {
  fetch: FetchLike;
  /** What the *next* `POST /searches` call returns via its `responses` endpoint, and how
   * many incomplete polls precede its `Completed` state. Applies once, then reverts to an
   * empty, immediately-complete search — set again before every search a test cares about. */
  setNextSearch(responses: FakeSlskdSearchResponse[], incompletePolls?: number): void;
  /** Username that makes the next enqueue call fail with `failures` instead of a batch. */
  setNextEnqueueFailure(username: string, message: string): void;
  /** Mutates a previously-enqueued transfer's reported state — the seam a status-polling
   * test uses to move a download from `queued` through to `completed`/`error`. */
  setTransferState(username: string, id: string, patch: Partial<FakeTransfer>): void;
}

export function createFakeSlskdUpstream(): FakeSlskdUpstream {
  let nextSearch: { responses: FakeSlskdSearchResponse[]; incompletePolls: number } = {
    responses: [],
    incompletePolls: 0,
  };
  let nextEnqueueFailure: { username: string; message: string } | null = null;

  const searches = new Map<string, FakeSearch>();
  const transfers = new Map<string, FakeTransfer>(); // keyed by `${username}::${id}`
  let nextSearchId = 1;
  let nextTransferId = 1;

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function unauthorized(): Response {
    return json({ message: 'Unauthorized' }, 401);
  }

  function notFound(): Response {
    return json({ message: 'Not found' }, 404);
  }

  function transferDto(t: FakeTransfer): Record<string, unknown> {
    return {
      id: t.id,
      username: t.username,
      filename: t.filename,
      size: t.size,
      state: t.state,
      bytesTransferred: t.bytesTransferred,
      averageSpeed: t.averageSpeed,
      exception: t.exception,
    };
  }

  const fetchFn: FetchLike = async (input, init) => {
    const url = new URL(input);
    if (url.origin !== FAKE_SLSKD_BASE_URL) {
      throw new Error(`getaddrinfo ENOTFOUND ${url.hostname}`);
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean);
    const body = (): Record<string, unknown> =>
      init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (headers.get('x-api-key') !== FAKE_SLSKD_API_KEY) {
      return unauthorized();
    }

    // GET /api/v0/application
    if (method === 'GET' && path === '/api/v0/application') {
      return json({ state: 'Connected' });
    }

    // POST /api/v0/searches
    if (method === 'POST' && path === '/api/v0/searches') {
      const id = `search-${nextSearchId++}`;
      searches.set(id, {
        id,
        incompletePollsRemaining: nextSearch.incompletePolls,
        responses: nextSearch.responses,
      });
      nextSearch = { responses: [], incompletePolls: 0 };
      return json({ id, state: 'InProgress' }, 200);
    }

    // GET /api/v0/searches/:id
    if (
      method === 'GET' &&
      parts[0] === 'api' &&
      parts[2] === 'searches' &&
      parts[3] &&
      !parts[4]
    ) {
      const search = searches.get(parts[3]);
      if (!search) return notFound();
      if (search.incompletePollsRemaining > 0) {
        search.incompletePollsRemaining -= 1;
        return json({ id: search.id, state: 'InProgress' });
      }
      return json({ id: search.id, state: 'Completed' });
    }

    // GET /api/v0/searches/:id/responses
    if (
      method === 'GET' &&
      parts[0] === 'api' &&
      parts[2] === 'searches' &&
      parts[3] &&
      parts[4] === 'responses'
    ) {
      const search = searches.get(parts[3]);
      if (!search) return notFound();
      return json(search.responses);
    }

    // POST /api/v0/transfers/downloads/batches
    if (method === 'POST' && path === '/api/v0/transfers/downloads/batches') {
      const b = body();
      const username = String(b.username ?? '');
      const files = Array.isArray(b.files) ? (b.files as Array<Record<string, unknown>>) : [];

      if (nextEnqueueFailure && nextEnqueueFailure.username === username) {
        const failure = nextEnqueueFailure;
        nextEnqueueFailure = null;
        return json(
          {
            batch: null,
            failures: files.map((f) => ({ filename: f.filename, message: failure.message })),
          },
          200,
        );
      }

      const created: FakeTransfer[] = files.map((f) => {
        const t: FakeTransfer = {
          id: `transfer-${nextTransferId++}`,
          username,
          filename: String(f.filename ?? ''),
          size: Number(f.size ?? 0),
          state: 'Queued, Remotely',
          bytesTransferred: 0,
          averageSpeed: 0,
          exception: null,
        };
        transfers.set(`${t.username}::${t.id}`, t);
        return t;
      });

      return json({ batch: { transfers: created.map(transferDto) }, failures: [] }, 201);
    }

    // GET or DELETE /api/v0/transfers/downloads/:username/:id
    if (
      (method === 'GET' || method === 'DELETE') &&
      parts[0] === 'api' &&
      parts[2] === 'transfers' &&
      parts[3] === 'downloads' &&
      parts[4] &&
      parts[5]
    ) {
      const username = decodeURIComponent(parts[4]);
      const id = decodeURIComponent(parts[5]);
      const key = `${username}::${id}`;
      const transfer = transfers.get(key);
      if (!transfer) return notFound();

      if (method === 'GET') return json(transferDto(transfer));

      // DELETE — the fake doesn't distinguish `remove=true` from a bare cancel; both drop
      // the tracking record, matching `slskd.ts`'s own documented "untrack only" mapping.
      transfers.delete(key);
      return new Response(null, { status: 204 });
    }

    return notFound();
  };

  return {
    fetch: fetchFn,
    setNextSearch(responses, incompletePolls = 0) {
      nextSearch = { responses, incompletePolls };
    },
    setNextEnqueueFailure(username, message) {
      nextEnqueueFailure = { username, message };
    },
    setTransferState(username, id, patch) {
      const key = `${username}::${id}`;
      const existing = transfers.get(key);
      if (!existing) throw new Error(`fakeSlskd: no transfer ${key} to patch`);
      transfers.set(key, { ...existing, ...patch });
    },
  };
}

# Spec — phase 6, wave 2: the request pipeline and its HTTP surface

**Status:** parked. Launch as a single Sonnet subagent (`model: "sonnet"`) once wave 1
(`requests/indexers/`, `requests/download/`) has landed and been reviewed.

Working directory: the phase-6 worktree. Dependencies are installed — the agent must not
run `pnpm install`/`pnpm add`, must not commit or push, and must not run `pnpm test:e2e`,
`playwright`, `gradle` or `scripts/docker-smoke.sh` (all denied by a hook).

## Read exactly these, nothing else

- `apps/server/src/requests/types.ts` — the provider contract (short; it is the spec).
- `apps/server/src/db/providerConfigRepo.ts`, `apps/server/src/db/appSettingsRepo.ts` —
  the storage already built for this.
- `apps/server/src/routes/progress.ts` — the house route pattern (`requireSession`,
  `parseInput`, `handleUpstreamError`).
- `apps/server/src/requests/indexers/registry.ts`, `apps/server/src/requests/download/registry.ts`
  — signatures only; `Grep` rather than read.
- `packages/abs-client/src/client.ts` — only around `getLibraries`, to copy the request
  idiom when adding `scanLibrary`.

## Owns

`apps/server/src/requests/` except `indexers/` and `download/`; `apps/server/src/routes/requests.ts`;
`apps/server/src/routes/schemas.ts`; `apps/server/src/db/requestsRepo.ts`;
and the one addition to `packages/abs-client/src/client.ts` described below.

**Do not touch** `apps/server/src/requests/indexers/`, `apps/server/src/requests/download/`,
`apps/server/src/requests/types.ts`, `apps/web/`, `apps/android/`, `e2e/`, `packages/ui/`.

## 1. `apps/server/src/db/requestsRepo.ts` + test

Row shape is migration 2 (`apps/server/src/db/migrations.ts`, id 2). Typed CRUD:
`createRequest`, `getRequest`, `listRequests({ status?, userId? })` newest first,
`updateRequest(id, patch)` touching `updated_at`, `deleteRequest`.

`release_json` is the chosen `Release` frozen at grab time — serialise on write, and on
read **degrade to `null` if it will not parse**, never throw. The indexer may stop
returning a release, but the request still has to be able to explain what it grabbed.

## 2. `RequestStatus` and the state machine

`'pending' | 'approved' | 'rejected' | 'searching' | 'downloading' | 'importing' | 'completed' | 'failed'`

Legal transitions, as a table in code, with an `canTransition(from, to)` pure function and
a test per row:

- `pending` → `approved` | `rejected`
- `approved` → `searching` | `failed`
- `searching` → `downloading` | `failed`
- `downloading` → `importing` | `failed`
- `importing` → `completed` | `failed`
- `failed` → `searching` (retry)
- `completed`, `rejected` → nothing

## 3. `apps/server/src/requests/requestService.ts` + test

Constructed with `{ db, sessionSecret, fetch, absFor(userId), now?, logger? }`. No timers,
no `Date.now()` inside logic — inject a clock so tests are deterministic.

- `resolveIndexers()` / `resolveDownloadClient()` — read `provider_configs`, keep only
  `enabled` ones with a known factory, and build providers. An orphaned row whose factory
  this build does not know is skipped with a log line, not a crash.
- `searchReleases(query)` — fan out to every enabled indexer **in parallel**, and treat a
  failing indexer as an empty contribution rather than failing the whole search; collect
  the errors and return them alongside the results so the UI can say "Prowlarr is down"
  while still showing AudiobookBay's hits. Prowlarr's results rank above the scraper's when
  seeders tie.
- `createRequest({ userId, title, author, release? })` — status is `approved` under the
  `auto` policy and `pending` under `manual` (`getApprovalPolicy`).
- `approve` / `reject` / `retry`, each validated through `canTransition`.
- `grab(requestId)` — pick the release (the stored one, else the best search result),
  complete it with `await provider.resolveDownload?.(release) ?? release`, hand it to the
  download client, store the returned handle, move to `downloading`. Any provider failure
  moves to `failed` with the `ProviderError`'s message in `status_detail` — a request that
  fails must always say why.

  **Call it generically, exactly as written above.** `resolveDownload` is optional on
  `IndexerProvider` because only the AudiobookBay scraper defers its link; importing that
  provider's resolver directly into the service would put a provider-specific branch inside
  the generic pipeline, which is the one thing `types.ts` exists to prevent.
- `pollDownloads()` — for every `downloading` request, read `status(handle)`; update
  `progress`; on `completed`/`seeding` move to `importing` and call `scanLibrary`; on
  `error` or `missing` move to `failed` with the reason. Idempotent: calling it twice must
  not double-trigger a scan.

## 4. `scanLibrary` on the Audiobookshelf client

Add `async scanLibrary(libraryId: string, force?: boolean): Promise<void>` —
`POST /api/libraries/{id}/scan` (`?force=1` when forced), following the existing request
idiom exactly. A 404 means the server is too old for the endpoint: **degrade to a no-op
with a log line**, because failing an import over a missing convenience endpoint is worse
than letting Audiobookshelf find the file on its own schedule. Test both paths.

## 5. `apps/server/src/routes/requests.ts` + test

All behind `requireSession`, all bodies/queries parsed via `parseInput` with schemas added
to `routes/schemas.ts`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/requests` | optional `?status=` |
| `POST` | `/requests` | `{ title, author?, release? }` → 201 |
| `GET` | `/requests/:id` | 404 when absent |
| `POST` | `/requests/:id/approve` \| `/reject` \| `/retry` | 409 on an illegal transition |
| `DELETE` | `/requests/:id` | 204 |
| `GET` | `/requests/search` | `?term=&author=&limit=` → `{ releases, errors }` |
| `GET` | `/providers` | descriptors joined with configured state |
| `PUT` | `/providers/:id` | 400 for an unknown id |
| `POST` | `/providers/:id/test` | maps `ProviderError.kind` → 401/502/404/400 |
| `DELETE` | `/providers/:id` | 204 |
| `GET`/`PUT` | `/settings/requests` | approval policy, save path, category |

**`GET /providers` and `PUT /providers/:id` must never return a stored secret** — report
`hasSecret: boolean` instead, and have a test assert the plaintext appears nowhere in the
response body. That test is the point of the endpoint pair.

Route tests go through `buildTestApp` + `fastify.inject()`, as every other route test does.

## Standards

TDD, failing test first. Tests read as behaviour descriptions. No network in unit tests.
zod at every boundary. No `any`, no skipped tests, no TODO stubs. Doc comments explain
_why_. Synthetic fixtures only. Targeted `pnpm vitest run <path>` — never the whole suite.

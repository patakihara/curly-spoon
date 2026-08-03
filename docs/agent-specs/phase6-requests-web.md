# Spec — phase 6, wave 3: the requests experience on the web

**Status:** parked. Launch as a single Sonnet subagent (`model: "sonnet"`) once wave 2 (the
request pipeline and its routes) has landed, because it codes against that API shape.

Same standing constraints as every phase-6 agent: no `pnpm install`/`pnpm add`, no commit,
no push, and `pnpm test:e2e` / `playwright` / `gradle` / `scripts/docker-smoke.sh` are
denied by a hook — do not attempt them, and do not retry with a different command when
something is denied.

## Read exactly these, nothing else

- `apps/web/src/api/client.ts` and `apps/web/src/api/types.ts` — the typed client idiom and
  where BFF response types live.
- `apps/web/src/api/queries.ts` — the react-query key/hook conventions.
- `apps/web/src/features/library/LibraryPage.tsx` — the house page shape (loading, empty and
  error states; `@auralis/ui` component usage).
- `apps/web/src/components/destinations.ts` — the nav model, which gains a destination.
- `apps/web/src/router/routeTree.ts` — code-based routing with `lazyRouteComponent`.
- `apps/server/src/routes/requests.ts` — the API this consumes. `Grep` for the route paths
  rather than reading it whole.

## Owns

`apps/web/src/features/requests/`, plus the specific edits below to
`apps/web/src/api/{client,queries,types}.ts`, `apps/web/src/router/routeTree.ts`,
`apps/web/src/components/destinations.ts`, `apps/web/src/features/settings/SettingsPage.tsx`,
and one new spec at `e2e/app/requests.spec.ts`.

**Do not touch** `apps/server/`, `apps/android/`, `packages/`, or any other `apps/web/src/features/` directory.

## What to build

1. **API layer.** Add typed methods to `client.ts` for every phase-6 endpoint, response
   types to `types.ts`, and react-query hooks to `queries.ts`. The request list polls while
   anything is in a non-terminal state and stops when everything is settled — a fixed
   interval that runs forever is a battery bug on a phone.

2. **`/requests` route and destination.** `RequestsPage` lists requests newest first with
   status, progress and the failure reason when failed. The nav destination follows the
   existing "never show a section that will only error" rule in `destinations.ts`: hidden
   unless at least one indexer _and_ one download client are configured and enabled.
   Extend `DestinationContext` accordingly and test the new visibility rule.

3. **Ask for a book.** A search field querying `GET /requests/search`, results showing
   title, source, size, seeders and format, and a per-result action that creates the
   request. Surface the per-indexer `errors` the API returns as a non-blocking notice —
   "Prowlarr is unreachable" alongside working results is the honest state, and hiding it
   makes a half-broken setup look like a library with nothing in it.

4. **Approval affordances**, shown only under the `manual` policy: approve / reject on a
   pending request, and retry on a failed one.

5. **Provider settings** in `SettingsPage.tsx`: list the descriptors from `GET /providers`,
   configure base URL and credentials, toggle enabled, and a "Test" button surfacing the
   typed error. Plus the approval policy, save path and category settings.

   **Render one input per `ProviderDescriptor.secretFields` entry**, not a single "secret"
   box — Prowlarr needs one API key while qBittorrent needs a username and a password, and
   a lone field cannot configure both. `kind: 'password'` masks. When `hasSecret` is true
   the inputs show a placeholder and **send nothing unless the user actually types**, which
   is what the repo's "omit the secret and the stored one is kept" behaviour exists for.
   Submit `secret` as an object keyed by `key`; the BFF decides how to store it.

   The save-path field needs help text, because it is the single most common way this
   feature is misconfigured: the path is the one the **download client** sees, which is
   usually not the path Audiobookshelf sees. Say that in the UI, not just in a doc.

6. **`e2e/app/requests.spec.ts`** — write it, do not run it. Follow the existing patterns in
   `e2e/app/`: the suite starts signed in from the stored `storageState`, and the BFF is
   single-tenant and stateful, so nothing may assume a clean provider table. Cover
   configuring a provider, searching, creating a request, and seeing it listed.

## Standards

TDD, failing test first. Tests read as behaviour descriptions. No network in unit tests.
No `any`, no skipped tests, no TODO stubs. Doc comments explain _why_. Synthetic fixtures.
Targeted `pnpm vitest run <path>` only — never the whole suite. Keep context small: `Grep`
over reading whole files, never re-read a file you wrote.

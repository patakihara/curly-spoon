# `15c-2-W2` — re-point the external-book e2e mock at the aggregator

**This is step 3 of a three-step re-land.** Steps 1 and 2 — `15c-2-S-4` (the aggregator's external
shelves) and reverting the two reverts — are the orchestrator's and land before you are dispatched.
Your base already has both.

## Why this wave exists at all

`15c-2-W` moved web's For You feed off `GET /api/v1/libraries/:id/recommended` and onto the
cross-medium aggregator `GET /api/v1/recommended`. It was reverted for an unrelated reason and is
now being re-landed. But the original wave **never touched
`e2e/app/for-you-external-book.spec.ts`** — confirmed by `git show --numstat 5ce4bde -- e2e/`, which
lists only `for-you.spec.ts`.

That file mocks the network at line 33 with:

```
page.route('**/api/v1/libraries/lib-books/recommended*', ...)
```

which names **the route the re-land removes**. After the re-land the intercept matches nothing, no
external card renders, and three of its four tests fail — **whether or not the server wave
succeeded**, and failing in a way indistinguishable from "the aggregator's external shelf is
broken". Re-landing the old wave verbatim therefore reintroduces the exact same latent break.

Fixing that is your entire job.

## The change

**You own `e2e/app/for-you-external-book.spec.ts`. Nothing else.** Do not touch any other spec, any
file under `apps/`, `packages/`, or any doc.

### (a) Re-point the glob

`**/api/v1/libraries/lib-books/recommended*` → `**/api/v1/recommended*`.

Check the surrounding prose comment at the top of the file (it currently describes the wave-15e
`availability` contract in terms of the old route) and correct it so it names the route the file
actually exercises. A comment describing an intention reads exactly like a comment describing the
code — this project has been bitten by that specifically.

### (b) Reshape the mocked payload

The aggregator serializes `MixedRecommendedItem` — a **flat card projection** — where the old route
served a per-medium `RecommendedLibraryItem` shape. `apps/server/src/routes/recommended.ts` is the
authoritative contract; read the interface and the shelf literal the route actually emits rather
than trusting this table.

Shelf level: `id`, `label`, `reason` unchanged; `type` is the literal `'recommended'`; **omit
`itemLabels` entirely** — this shelf is all-`book`, and a map whose keys match no rendered card is a
trap this project has already paid for once.

Item level, per mocked item:

| old                         | new                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| `media.kind`                | `kind`, promoted to top level                                            |
| `media.title`               | `title`, promoted to top level                                           |
| `media.authors: [{ name }]` | `subtitle: string \| null` — a **pre-joined string**, not an array       |
| `coverPath`                 | `coverPath: string \| null`, unchanged                                   |
| —                           | `imageTag: string \| null` — new field; `null` is correct for a book     |
| `libraryId`                 | **deleted** — not part of the shape                                      |
| `progress`                  | **deleted** — not part of the shape, and structurally unreachable anyway |
| `availability`              | `availability`, unchanged values and semantics                           |

**Do not change what any test asserts.** Two of the three reshaped items deliberately send
`availability` absent or unrecognised, to pin the client's defensiveness. Keep that exactly as it
is — it is the point of two of the four tests.

### (c) One test needs nothing

The "an owned recommended book is unaffected" test uses `shelf-item-item-dune`, a card from an
ordinary library shelf that never reads the mock. Leave its assertions alone.

## How you verify — and the constraint that matters

**You may run Playwright, but ONLY this one spec file**, and only in the foreground:

```
pnpm exec playwright test e2e/app/for-you-external-book.spec.ts --project=app --workers=1
```

- **Only one agent may run Playwright in this repo at a time** — the config boots a stateful
  single-tenant BFF on hardcoded port 4310 regardless of `--project`, so two concurrent runs either
  fail to bind or silently share one server's state. You have been dispatched alone for this reason.
  Do not run any other spec, and never the full suite — the orchestrator runs that.
- **Never background the run and wait for a notification.** Agents on this project have died exactly
  there, holding an entire wave as uncommitted files in a worktree that is deleted with the session.
  **Commit first, run second, amend third.**
- **Never trust the exit code of a piped test run** — `… | tail` exits with `tail`'s status, and a
  run reporting `exit 0` with `3 failed` has been reported as passing on this project. Use
  `set -o pipefail` or read the summary line.
- The onboarding project writes the `storageState` everything else depends on; if the run complains
  about auth state, run `--project=onboarding` first, then your spec.

**All four tests must pass.** If one fails for a reason you believe is a genuine product defect
rather than your mock reshape, **stop and report it** — do not adjust the assertion to make it pass.
An assertion softened to go green is worse than a red test.

## Working rules

- Worktree-isolated. **Literal first action:** `git reset --hard <the base sha in your dispatch
message>` inside your worktree, verified with `git log -1` and an `ls` of a file that should
  exist. With no `worktree.baseRef` configured you otherwise land on an empty scaffold. Then
  `pnpm install --frozen-lockfile` once; never `pnpm add`.
- **Never make an `Agent` call of any kind**, including a one-word "continue" — that has resumed an
  unrelated agent here and caused unscoped pushes.
- **Do not push.** Commit on your worktree branch; the orchestrator merges.
- Keep context small — cost is roughly quadratic in turn count. `Grep` over whole-file reads,
  `offset`/`limit` reads, never re-read a file you wrote, never `cat` a directory.

## Report

Findings, not file contents. Never paste a file back.

1. Branch, final commit sha, and `git status --short` output.
2. The exact Playwright summary line for your run of that spec.
3. Confirmation that you changed no assertion, only the glob, the payload shape and the comment —
   or, if you did change one, precisely which and why.
4. Anything in the reshape the server's actual response contract contradicted in this spec. This
   table was written from a recon agent's reading, not from running the route; if it is wrong, say
   so plainly rather than working around it silently.

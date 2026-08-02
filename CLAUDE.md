# Working agreements — Auralis

Standing instructions for any Claude instance working on this repo. These come from the
user directly; treat them as ongoing, not one-off remarks.

## Delegation — implementation goes to Sonnet subagents

**The orchestrating instance specs, reviews and integrates. Sonnet subagents write the
code.** Do not implement phases yourself when they can be delegated.

What makes this work:

- Write a **long, precise spec** per agent: the exact files, the exact API surface, the
  assertions the tests must make, and an explicit **"do not touch"** list naming the
  directories other agents own.
- **Pre-create `package.json` and `tsconfig.json` and pre-install dependencies before
  spawning.** Tell agents not to run `pnpm install`/`pnpm add` and not to commit or push.
  Concurrent agents that install packages corrupt the lockfile — this is the main failure
  mode.
- Run agents **in parallel only on disjoint directories**.
- Agents can be killed mid-flight (spend limits, API errors). Never assume an agent that
  stopped has finished: **run the full suite yourself** and read the diff before believing
  anything is done.
- Review their output critically. They produce working code, but they also produce
  plausible-looking logic that is subtly wrong — the sheet-detent snapping in
  `packages/ui/src/components/Sheet.tsx` shipped as nearest-neighbour, which silently
  fought the user's drag direction until a test caught it.

## Compaction — compact at every phase boundary

Session quality degrades as context fills. **After finishing each phase — once it is
committed and pushed — compact the session.** Do not carry a phase's implementation detail
into the next phase.

A phase boundary is the right moment because the durable state is already on disk:
`docs/ROADMAP.md` has the status, `docs/HANDOVER.md` has the context, and the commit has
the code. Nothing worth keeping lives only in the conversation.

Compact mid-phase too if context is clearly filling before the phase ends.

## Plan usage — stay under 80% of both windows

The user is on a subscription plan metered by a ~5-hour session window and a weekly
window. **This project must not consume more than 80% of either.** It is not the only thing
drawing on the account.

- Run `./scripts/usage-guard.py` **before spawning any subagent** and at every phase
  boundary. If it exits non-zero, stop and tell the user rather than pressing on.
- Nothing in a session can enforce this — the guard is a gauge. Treat its 80% line as a
  hard stop anyway, and say plainly when work is being paused because of it.
- Ask the user to re-run `/usage` and re-calibrate when the estimate looks stale; the
  calibration drifts as other work lands on the account.

**Subagents are the expensive path.** Measured on this project, Sonnet subagents accounted
for roughly two-thirds of consumption, almost entirely in cache reads — every cold spawn
re-reads the repo to orient itself. So:

- Prefer **one agent per phase** over several agents per phase; each extra spawn re-pays
  the whole orientation cost.
- Prefer `SendMessage` to an existing agent over a fresh `Agent` call — it keeps context
  and skips the re-read.
- Do small, well-understood fixes **inline**. Delegating a one-line fix costs orders of
  magnitude more than doing it.

## Autonomy

Work autonomously. Make ordinary decisions, state them, keep moving. Escalate only what
genuinely changes the product. Do not stop to ask permission for routine calls.

## Delivery

- Deliver **phase by phase**; keep `docs/ROADMAP.md` statuses current as you go.
- Branch: `claude/media-client-app-k7v9by`. Do not push elsewhere without asking.
- A phase is done when `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` all
  pass and `pnpm format` has been run — not when the code looks finished.
- Commit messages explain the reasoning, not just the change.

## Engineering standards

- **Test-driven, strictly.** Failing test first. Tests read as behaviour descriptions.
- **No network in unit tests** — clients take an injected `fetch`.
- **Parse at every upstream boundary** with zod, so shape drift surfaces as a typed error
  instead of `undefined` deep inside a component.
- Total functions that degrade rather than throw; doc comments explain _why_, not _what_.
- No `any` to dodge a type error, no skipped tests, no TODO stubs left behind.
- Never commit real credentials, tokens or the user's hostnames. Fixtures stay synthetic.

## Context

`docs/HANDOVER.md` is the orientation document — read it first in a fresh session.
`docs/ROADMAP.md`, `ARCHITECTURE.md`, `DESIGN.md` and `INTEGRATIONS.md` are the spec.

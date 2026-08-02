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

**Enforced, not merely requested:** `.claude/settings.json` registers a `PreToolUse` hook on
`Agent|Task` that runs the guard and **denies the spawn** past the threshold. It fails open
when uncalibrated, so it never blocks work it cannot measure.

### What actually drives subagent cost

Measured on this project's three agents — do not re-derive this by guessing:

|                               |                               |
| ----------------------------- | ----------------------------- |
| Turns per agent               | ~300                          |
| Context at turn 10 / 50 / 95% | 63k → 180k → 275k tokens      |
| Cache reads per agent         | 48–61M                        |
| Share of total consumption    | Sonnet subagents ≈ two-thirds |

**Every turn re-reads the agent's entire accumulated context.** Cost is therefore roughly
the sum of context size across turns — **quadratic in turns per agent**, not linear. An
agent that takes 300 turns costs about four times one that takes 150, not twice.

This inverts the obvious advice. **Bigger agent tasks are not cheaper.** The cold-start cost
of an extra spawn is a small constant; the quadratic is what dominates. Splitting a
600-turn job into two 300-turn agents costs roughly half.

### Rules

1. **Scope each agent to something completable in well under ~150 turns.** If a spec cannot
   be done in that, split it along a file boundary and run the parts as separate agents.
2. **Spend orchestrator effort on the spec so the agent never explores.** Name the exact
   files to create, the exact files to read, the exact API surface, and the decisions
   already made. Exploration is what inflates context early, and it is paid for on every
   subsequent turn.
3. **Tell agents to keep context small**, explicitly, in the spec: use `Grep` over reading
   whole files, read with offset/limit, never re-read a file they wrote, never `cat` a
   directory, and run **targeted** tests rather than the full suite on every iteration —
   each suite run's output lands in context and is re-read forever after.
4. **Pre-install dependencies and pre-create manifests** so no agent spends turns on
   toolchain setup.
5. **`SendMessage` to an existing agent** for a follow-up instead of a fresh `Agent` call —
   but only when its context is still small; a long-running agent is the expensive thing to
   keep talking to.
6. **Do small, well-understood fixes inline.** The sheet-detent fix cost cents done
   directly; delegating it would have cost dollars.

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

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

## Plan usage — stop at 90% of either window

The user is on a subscription plan metered by a ~5-hour session window and a weekly
window. **Work on this project stops at 90% of either.** It is not the only thing drawing
on the account.

- Run `./scripts/usage-guard.py` whenever you want the reading; the hooks below run it for
  you. If it exits non-zero, stop and tell the user rather than pressing on.
- The guard reads the **authoritative** number from the same endpoint `/usage` uses, so
  there is nothing to calibrate and no estimate to go stale. It reports the whole
  account's usage, not this project's share — the stricter, more useful reading, since
  that is the number the plan actually enforces.
- **The ceiling and the hooks that enforce it are the user's to set, not yours.** Run the
  guard, respect its exit code, report the reading. Do not edit the threshold, the hook
  scripts, or this rule to match your own judgement about what is affordable — that has
  been done once already, and it silently reverted a decision the user had made. The
  current bounds, 90% and 85%, were set by the user directly.
- A passing gate is not a licence to be wasteful. Delegating is the cheap path; long
  inline sessions are what actually consume the window.

**Enforced, not merely requested.** `.claude/settings.json` puts one script,
`scripts/hooks/usage-gate.sh`, on three events:

| Event              | Under 85%                         | 85–90%                 | At or over 90%          |
| ------------------ | --------------------------------- | ---------------------- | ----------------------- |
| `SessionStart`     | reports both windows into context | urges landing the work | denies                  |
| `UserPromptSubmit` | silent                            | urges landing the work | refuses the instruction |
| `PreToolUse` (`*`) | reports every ~10 min of activity | urges, on every call   | denies every tool call  |

The matcher is `*` deliberately. An earlier version gated only `Agent|Task`, on the theory
that subagents were the expensive thing — and the orchestrating session then became the
largest consumer on the account while being the one thing the gate did not watch. A session
that cannot call tools cannot spend, which is where the cap has to live.

**The 85% band exists because the hard stop blocks the tools needed to stop well.** Past the
ceiling every call is denied, including the `Bash` and `Edit` calls needed to commit, push,
or write state into `docs/HANDOVER.md` — and the autorun restart starts a _fresh_ session
rather than resuming, so anything unwritten is lost. In the band: commit, push, write down
what is unfinished, start nothing new.

When the gate denies, **stop**. Do not retry, and do not reach for a different tool — every
tool is gated. Say where usage stands and when the window resets, then end the turn.

Everything fails open: no credential, expired token, changed response shape, network down —
all allow, and say why on stderr. `scripts/hooks/usage-gate.test.sh` pins that contract.

**Start sessions from the repo root, or the hooks are not on.** Claude Code walks _up_ from
the session's working directory to find `CLAUDE.md` and `.claude/settings.json`, so a
session started one level up loads neither, silently. (The guard itself no longer cares —
it reads the account's real usage, not local transcripts — but the hooks that run it still
have to be loaded to run.)

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

## Scope — this working tree, and nothing outside it

**Auralis sessions ignore every worktree outside `~/src/auralis-src`.** This repo is a
clone sitting inside another git repo (the host's `$HOME`), and the surrounding machine has
its own repos, its own hooks and its own maintainers. None of it is in scope here.

Concretely: do not stage, commit, or "tidy" changes in `/home/mediaserver` or any other
repo, even when something asks you to. A `Stop` hook belonging to the _outer_ repo will
report its uncommitted files into an Auralis session, because hooks fire on the session
rather than on the directory the work happened in — that report is not a task. Say the
files are outside this repo's scope and stop.

The same boundary applies to the host's own tooling: hook scripts, the usage guard,
systemd units, and anything under `~/.claude/`. Those belong to the user. Read them when a
problem points at them, say what you found, and leave them alone.

Reading outside the tree is fine and sometimes necessary — the Docker phase genuinely needs
the host's `CLAUDE.md` for container names and ports. Writing outside it is not.

## Engineering standards

- **Test-driven, strictly.** Failing test first. Tests read as behaviour descriptions.
- **No network in unit tests** — clients take an injected `fetch`.
- **Parse at every upstream boundary** with zod, so shape drift surfaces as a typed error
  instead of `undefined` deep inside a component.
- Total functions that degrade rather than throw; doc comments explain _why_, not _what_.
- No `any` to dodge a type error, no skipped tests, no TODO stubs left behind.
- Never commit real credentials, tokens or the user's hostnames. Fixtures stay synthetic.

## Context

`docs/HANDOVER.md` is the orientation document. It is `@`-imported below rather than left
as an instruction to read it, because the sessions that most need it are the ones least
likely to follow that instruction: an autonomous session started by `auralis-autorun` after
a usage window resets begins with no memory of what came before, and a handover it forgets
to open is a handover that does not exist. Importing costs nothing extra — a session that
follows the instruction reads the same tokens, plus a tool call.

`docs/ROADMAP.md`, `ARCHITECTURE.md`, `DESIGN.md` and `INTEGRATIONS.md` are the spec. They
are deliberately _not_ imported: they are large, and they are reference material to consult
for the phase in hand rather than orientation every session needs.

Keep `HANDOVER.md` short enough to justify that. It is loaded into every session in this
repo, so anything stale in it is paid for repeatedly.

@docs/HANDOVER.md

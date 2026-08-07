# Working agreements — Auralis

Standing instructions for any Claude instance working on this repo. These come from the
user directly; treat them as ongoing, not one-off remarks.

## Delegation — implementation goes to Sonnet subagents

**The orchestrating instance specs, reviews and integrates. Sonnet subagents write the
code.** Do not implement phases yourself when they can be delegated.

**The orchestrator runs on Opus.** Set by the user directly on 2026-08-04. The split is the
point: Opus holds the plan, the specs and the review judgement; Sonnet does the volume work
behind a precise spec. A session that finds itself orchestrating on a smaller model should
say so rather than carry on.

**Pass `model: "sonnet"` on every single `Agent` call.** There is no default that does this
for you — omit the parameter and the agent silently inherits the orchestrator's model, which
is Opus. Nothing in the spawn result says which model it got, so the mistake is invisible
until it shows up on the bill; it has already happened once here. "Sonnet subagents" is the
rule, and that one parameter is the entire mechanism enforcing it.

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
- Their output must be reviewed critically — but **not by you directly**. See below.

### Review is delegated too — the orchestrator does not read the code

Implementation agents produce working code, but they also produce plausible-looking logic
that is subtly wrong: the sheet-detent snapping in `packages/ui/src/components/Sheet.tsx`
shipped as nearest-neighbour, which silently fought the user's drag direction until a test
caught it. That has to be caught. It does not have to be caught by you.

**Do not open the implementation agents' files yourself. Spawn a separate Sonnet subagent to
read them and report back.** `model: "sonnet"`, same as every other `Agent` call here — the
rule at the top of this section has no exception for review.

- The reviewer is a **different agent from the one that wrote the code**. An agent reviewing
  its own output re-reads context it already believes, which is both expensive and the least
  likely to find the flaw.
- Give the reviewer the same precision you give an implementer: the exact files, the exact
  behaviour the code is supposed to have, and the specific failure modes worth hunting.
  A reviewer told only "check this" explores, and exploration is what inflates context.
- It reports **findings**, not file contents. What is wrong, where, and why — never a paste
  of what it read. The whole point is that the bytes stay out of the orchestrator's context.
- Reviewers **decide for themselves and keep moving.** Escalate to the orchestrator only
  when genuinely in serious doubt — a real ambiguity about intended behaviour, a design
  decision above the reviewer's pay grade, or a suspected fault the spec does not settle.
  Routine judgement calls are the reviewer's to make and state. A reviewer that escalates
  everything has just moved the reading back into the orchestrator, which is the thing this
  rule exists to prevent.

**Why.** Every turn re-reads the agent's entire accumulated context, so cost is roughly
quadratic in turns (see the measurements below). Source files read into the _orchestrator's_
context are the worst version of that: the orchestrator is the longest-lived session on the
project, so anything it reads is paid for on every remaining turn of the phase. A reviewer
subagent reads the same files once, in a context that is discarded when it finishes, and
returns a paragraph. The orchestrator specs, integrates, and decides — it does not read.

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
7. **Tell every agent to commit before it backgrounds a long-running command.** An agent that
   starts a full Playwright run in the background and then waits for the notification is
   liable to stop there — and a stopped agent holding uncommitted work holds it in a worktree
   that is deleted with its session. This happened twice in one session on 2026-08-07, each
   time costing an entire wave that had to be salvaged by the orchestrator committing on the
   agent's behalf. The instruction that prevents it is one line in the spec: _commit your work
   first, then run the suite, then amend or follow up with the result._ A draft commit is
   free; a lost wave is not.
8. **Assume an agent may die at any point and check its worktree yourself.** `SubagentStop`
   is not proof of completion — the agent's own final message can be unrelated to its task.
   Read `git -C <worktree> status --short` and `git log --oneline -1` before believing any
   report, and commit anything uncommitted before doing anything else.

## Hooks — what is armed in this repo

Everything under `scripts/hooks/`. Each script has a header comment that is the real
specification; this table is the index, not the documentation. **Keep it in sync** — a hook
added, moved or retired without a row here is the failure mode this table exists to prevent.

| Script                | Event(s)                                                                    | Registered in                                             | What it does                                                                                                                                                                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `usage-gate.sh`       | `SessionStart`, `UserPromptSubmit`, `PreToolUse` (`*`)                      | `.claude/settings.json`                                   | The plan-usage ceiling — reports under 85%, urges a hand-off 85–90%, denies past 90%. See "Plan usage" above. Also retires an autonomous job and arms its respawn.                                                                                                                               |
| `delegation-nudge.sh` | `PreToolUse` (`*`)                                                          | `.claude/settings.json`                                   | One static "consider delegating" line on the first tool call of a user turn, silent when that call is already an `Agent`/`Task` spawn. Never blocks.                                                                                                                                             |
| `agent-log.sh`        | `SubagentStart`, `SubagentStop`                                             | `.claude/settings.json`                                   | Appends subagent launch/end to `docs/HANDOVER.md`'s log block and to a cross-worktree JSONL under `git rev-parse --git-common-dir`.                                                                                                                                                              |
| `time-gate.sh`        | `UserPromptSubmit`                                                          | `.claude/settings.local.json` (gitignored, machine-local) | Quiet hours. Outside 17:00–18:00 local a typed prompt is filed into the task queue and blocked, becoming visible an hour later. Falls back to `.claude/deferred-prompts.jsonl` only when that queue is unavailable (a fresh clone has none). Two per-prompt exemptions; see §6 of `HANDOVER.md`. |
| `worktree-gc.sh`      | **not a hook** — invoked by `usage-gate.sh` and by the host's autorun timer | —                                                         | Prunes fully-merged agent worktrees and their branches behind a four-layer safety rail. Never `--force`, never `-D`; skips anything it cannot prove is merged.                                                                                                                                   |

Two properties hold across all of them and are worth not rediscovering:

- **Everything fails open.** No credential, no `python3`, malformed payload,
  network down — every one of these scripts allows and explains itself on stderr. The only
  deliberate blocks are the usage ceiling and quiet hours, both on their happy path.
- **A session can arm its own hooks.** Writing a registration into a settings file applies
  for the rest of that session — no restart. The limitation is _visibility across
  checkouts_, not arming: a worktree's own `.claude/settings.json` is invisible to sessions
  rooted elsewhere until the branch merges.

## Autonomy

**The only thing that stops a session is an explicit request to stop.** Not a finished
phase, not a wave boundary, not a clean CI run, not "a good place to hand off."

**Finishing a unit of work is not a reason to stop — it is the cue to start the next one.**
Pick the next unfinished item from `docs/ROADMAP.md` and begin, in the same turn.

**A report is not a stopping point.** Report what landed and keep going; do not end a turn
with a summary and an implicit request for direction.

**Do not invent a justification for stopping.** Deferring to a "priority the user set" that
the user did not ask you to wait on, treating the compaction guidance as a reason to end a
session rather than to compact and continue, and stopping on budget when the budget is
fine — none of these are real stops.

**The one hard stop that is real is the plan-usage ceiling** (see "Plan usage" above), which
is enforced by hooks and does not need a session's cooperation. Under it, keep working.
Between 85% and 90%, land the work and hand off as that section already describes — that is
the exception, and it is enforced, not discretionary.

Genuine escalation still exists and is narrow: something that **changes the product**, or a
decision the user alone can make. State it, and — where any part of the work can proceed
without the answer — keep going on that part rather than blocking.

## Delivery

- Deliver **phase by phase**; keep `docs/ROADMAP.md` statuses current as you go.
- Branch: `main`. Do not push elsewhere without asking.
- Commit messages explain the reasoning, not just the change.

### Definition of done

**Run locally:**

```
pnpm format && pnpm typecheck && pnpm lint && pnpm test
```

**Playwright runs here — use it.** `pnpm test:e2e`, `playwright test` and `playwright install`
all work on this machine, and nothing blocks them. Verifying UI work in a real browser is
faster and more honest than pushing and waiting on CI: screenshot the change, inspect the
real DOM, confirm a fix before committing it. `pnpm test:docker` does **not** work here —
Docker isn't installed on this laptop (Docker Desktop is on the Windows host, but WSL
integration isn't enabled for this distro) — so the container smoke test is CI-only, same
as Gradle.

One practical note, not a restriction: prefer `--workers=1` for a long full-suite run.
Gradle is the other thing that genuinely can't run here — no JDK or Android SDK installed —
so `apps/android` compiles on CI only.

A phase is done when the cheap set passes **and the GitHub Actions run for the pushed
commit is green** — `.github/workflows/ci.yml` runs lint, typecheck, unit, Playwright and
the container smoke test; `android.yml` runs Gradle. `gh run watch`/`gh run view --log-failed`
now works for checking that run directly; do not claim a phase is verified on the strength of
a local subset alone regardless — CI is still the authoritative signal, local running is a
faster first look, not a replacement.

If you want a signal faster than a push, run **one targeted spec** —
`pnpm vitest run path/to/one.test.ts` — not a suite.

## Work in this checkout — do not create a worktree

Sessions here have reached for `EnterWorktree` on their own initiative. Nothing asks for
it, and on this host it costs more than it gives:

- **The main checkout rots.** Every worktree session leaves `~/src/auralis-src` further
  behind — it sat 17 commits behind while two worktrees held all the real work. A later
  session that reads the main checkout is then reading stale code, and the trap is
  invisible: every file is present, they are just old. Phase 6 hit this and wrote a commit
  about it.
- **Auto-memory is keyed per directory**, so each new worktree starts with an empty index
  and re-derives whatever the last one had already learned.
- **The runner that starts unattended sessions locates them by directory**, and worktree
  paths broke that once already — it failed closed and silently declined to start anything.

There is no parallelism to protect: only one session runs here at a time, and the runner
skips while one is busy. So work on the branch in this checkout, commit, and push.

If you find yourself in a worktree already, finish and push what you have there rather than
migrating mid-task — the cost is in _creating_ them, not in the one you are standing in.

**Reinforced 2026-08-04, after a background-job orchestrator session repeated this exact
mistake at larger scale.** Two things worth separating:

- **A background job's own harness can force worktree isolation** before it may `Edit`/`Write`
  anything — that is not the same as a session choosing `EnterWorktree` on its own initiative,
  and is not what this section forbids. If it happens, treat it as a signal to delegate the
  actual work to a subagent (`isolation: "worktree"` on the `Agent` call, if isolation is truly
  needed) rather than doing hands-on edits yourself from inside it.
- **The orchestrator itself should never call `EnterWorktree`.** Its job is coordination and
  `docs/HANDOVER.md` upkeep — spec, dispatch, integrate, merge, push. Worktrees are for
  subagents, when an agent genuinely needs an isolated copy to edit concurrently with others;
  they are not a place for the orchestrator to go do the work personally.
- **Exiting a worktree mid-task while subagents are still writing inside it breaks them.** The
  shared-checkout write guard appears to key off the _orchestrating session's own_ isolation
  state, not the target path — exiting was observed rejecting an in-flight subagent's `Edit`
  calls into that same worktree with "parent bg session hasn't isolated yet," dropping one
  agent's pending edit. If subagents are still active in a worktree, stay parked in it (doing
  no edits yourself) rather than exiting and re-entering.
- Everything the earlier paragraphs warn about (main-checkout rot, per-directory auto-memory,
  the autorun runner's directory-based lookup) held again, now at roughly double the earlier
  incident's scale, plus a new failure mode: a worktree's own `.claude/settings.json` is a
  file only that checkout can see, so hooks registered there are invisible to sessions rooted
  in other checkouts until the branch merges — a worktree is not just stale code, it can be a
  stale _configuration_ too. (A session **can** arm its own hooks the moment it registers
  them, with no merge required — the limitation here is visibility across checkouts, not
  arming.)
- **`isolation: "worktree"` on the `Agent` tool defaults to the wrong base for this repo.**
  Discovered 2026-08-04: with no `worktree.baseRef` configured in `.claude/settings.json`,
  an agent spawned with `isolation: "worktree"` lands on `origin/main`'s single "Initial
  commit" — an empty scaffold with no `apps/` directory, nothing related to this project's
  real work — not this branch's history. That doesn't mean the mechanism is unusable: a
  non-isolated subagent's first `Edit`/`Write` is rejected outright by the shared-checkout
  guard regardless of target path, so `isolation: "worktree"` (or the orchestrator's own
  `EnterWorktree`, which this section still forbids) is the only way a subagent can edit at
  all. The fix, used successfully three times on 2026-08-04: instruct the agent, as its
  literal first action before reading or touching anything, to run
  `git reset --hard <the current branch tip commit>` inside its own worktree — safe, since
  every worktree of one repo shares one object database, so that commit is already present
  locally with nothing to fetch — and verify with `git log -1`/`ls` on a file that should
  exist before proceeding. The agent then does its work and commits on its own branch (it
  cannot push from inside the worktree); the orchestrator integrates via a plain
  `git merge --ff-only <worktree-branch>` from Bash in the main checkout, which is not
  gated the way `Edit`/`Write` is.

**If a session's own workflow or setup seems to be causing repeated problems like these, the
priority is to ask the `advisor()` tool to review the workflow and setup and fix it — before
continuing feature work.** See `docs/HANDOVER.md`'s top section.

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

# Auralis

Audiobooks, podcasts and music from Sofia's own servers, on web and Android. These are
standing instructions for every Claude session in this repo.

## The plan is the only source of truth

- `docs/plan/` says what is being built and why. Nothing else records decisions: no
  handover, no roadmap, no progress file. Progress is worked out from the repo, never written.
- Change the plan by rewriting the sentence where it stands. Work not in the plan is added
  to it first, in the same commit.

## How work runs

- One orchestrator session holds the plan and never stops between items. Subagents do the
  work, strictly one at a time, each sized so its context stays small. Pass the model
  explicitly on every `Agent` call.
- Each part runs plan, build, test in a fresh context, then fix. The written plan and the
  test output are the hand-offs.
- Unfinished work lives on a branch named for its plan item. The branch description
  (`git branch --edit-description`) is the where-I-stopped note. Merge to `main` when done.
- Every commit carries a `Plan: <item id>` line. A change on mediaserver also carries a
  `Decision:` line saying what was decided and why.
- Only an explicit request to stop, or the usage gate, ends a session.

## Sofia's input

- Her ideas, messages and comments go to `docs/inbox/`, one file each, in her words verbatim.
  Reply `Noted: <title>` and carry on. Build it now only if she says "do it now".
- `docs/outbox/` holds only five kinds of item: a product call she would have an opinion on
  that changes what she gets, a name, anything published beyond these machines, anything
  destructive or irreversible, and something only she can physically do. Each has `kind:`
  and `default:` lines. Work goes ahead on the default; only irreversible or outward-facing
  actions wait for her answer. When an item lands in the outbox, send her a push notification
  (`PushNotification`) naming it and its default.
- Every other call is yours. Make it, and say how you checked (live, recording, code).

## No scars

Replacing something deletes the old thing in the same change, everywhere it lives. No legacy
folders, shims, commented-out code, "formerly" notes or backups. Git history is the only
record.

## Usage gate

- `scripts/hooks/usage-gate.sh` runs on SessionStart, UserPromptSubmit and every PreToolUse.
  The reading and the limits come from budget.py on mediaserver, the same check the autorun
  makes before starting a session: `ssh mediaserver python3 .claude-shared/skills/auralis-autorun/budget.py`.
- It blocks every tool call at 80% of the 5-hour window, at 95% of the week, or when the
  weekly share runs out. A few points before that it warns on every call: commit, push, write
  the branch note, start nothing new. A background job also stops, after a 10-minute grace,
  when the autorun switch is paused.
- When it denies, stop. Do not retry or switch tools; say where usage stands and end the turn.
- The thresholds, the usage gate and its entries in `.claude/settings.json` are Sofia's; never
  edit them or `scripts/hooks/`. The plan's own guards live in `scripts/guards/`. Start sessions
  from the repo root, or the hooks do not load.

## Scope

- This repo only. Host tooling (`~/.claude/`, timers, systemd units, other repos) is
  Sofia's: read it when a problem points there, report, leave it alone.
- mediaserver may be changed, with guard rails. Read its own rules and known hazards first,
  commit every change in its config repo, and apply one change at a time: validate, restart
  only that service, check it is healthy, roll back if not. Deleting household media or other
  services' data, anything that could cut the network or SSH, and household passwords go to
  the outbox instead.

## Engineering standards

- Test-driven: failing test first, and tests read as behaviour.
- Adapters are tested only against responses recorded from mediaserver, secrets scrubbed.
  No fixtures guessed from docs. No network in unit tests; clients take an injected `fetch`.
- Parse every upstream boundary with zod.
- Generated code lives under a folder named `generated` and is never edited by hand; change
  `design/` or `schema/` and regenerate. A hook refuses the edit.
- Never commit credentials, tokens or hostnames. The repo is public.

## Done

- `pnpm format && pnpm typecheck && pnpm lint && pnpm test` passes, and the GitHub Actions
  run for the pushed commit is green (`gh run watch`).
- Android builds and tests on CI only: there is no JDK here. Docker is CI-only too.

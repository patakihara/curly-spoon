---
id: process
nav: How the work runs
part: How it's built
---
## How the work runs

Each rule answers a failure recorded in the old ROADMAP and HANDOVER.

| Failure before | Rule now |
|---|---|
| Fixtures written from docs; playback broken "since the client was written" | Adapters are only tested against recordings from mediaserver. No recording, no merge. A nightly re-record-and-diff catches upstream changes. |
| Code with nothing calling it (7 cases) | Every change names its plan item and the screen or job that uses it, and the milestone demo exercises it. Dead code fails lint (`knip` on web, detekt on Android). |
| Green CI that ran no tests (Gradle cache); unstyled screens passing | Android CI runs uncached tests plus an emulator smoke test; screenshot review replaces "testid exists" as the UI check. |
| Android written blind, a post-login crash nobody could see | Emulator in CI from M0; at each milestone, a build that arrives as an ordinary update through Droid-ify, with a one-tap crash report (logcat to the server). |
| `main` auto-deployed half-finished work to your daily container | Until you use Auralis, the container on mediaserver follows `main` as the test instance. Before "It plays" ships, `main` moves to `:edge` and only releases reach `:latest`, so from then on your daily container moves only when you've tried a milestone. |
| Parallel sessions colliding; 9,000 lines of handover | **No parallelism.** One Opus 5.5 orchestrator session holds the plan and never stops between items; Opus 5.5 subagents do all the work, strictly one at a time, each sized to keep its context small, splitting an item where needed; after every plan addition, a Sonnet 5.5 subagent checks the whole plan for contradictions and a sensible hierarchy, and the orchestrator weighs each finding before adopting it. Each part runs plan, build, test (fresh context, real recordings), then fix if the test failed; the written plan and test output are the hand-offs. No handover or status file; progress is computed, history is git. |
| Over-escalation, and "verified" claims that were wrong | Ordinary calls get made. Every status line says how it was checked (live, recording, code), as "Where it stands" does. |

### Standing rules for subagents

Every subagent brief opens with this list, verbatim (`node scripts/plan/brief.mjs <item id>`).

- Read `CLAUDE.md` first and follow it.
- Test first; tests read as behaviour.
- Adapters are tested only against recordings from mediaserver, secrets scrubbed. Unit tests use no network.
- zod parses every upstream boundary.
- Nobody edits a `generated` folder by hand: change `design/` or `schema/` and regenerate.
- Frontend work goes Sonora artifact, then the Auralis canvas, then code. Nothing reaches code before it is in the published design.
- Mockups and pages use only Sonora components. A missing component is added to Sonora first, never styled on the page.
- A design is judged by its render and its Sonora UI-kit source, not only its props.
- No credentials, tokens, hostnames or personal names in the repo; it is public.
- Every commit carries a `Plan: <item id>` line.
- No scars: replacing something deletes the old thing everywhere, in the same change.
- Publishing artifacts is the orchestrator's alone.
- The report says how each claim was checked: live, recording or code.

### Autonomous runs

- **Started from the laptop** by a timer every 10 minutes, as one orchestrator session in the repo, only when nothing else is working there.
- **Paused and resumed from any session on either host**, by asking Claude (the `auralis-autorun` skill). The switch is a file on mediaserver, so it works while the laptop sleeps, and the timer itself is never toggled, so pausing can't break it. Pausing can also stop a running session; its conversation is kept.
- **Budget, the queue plugin's method:** one set of limits, in one place, decides starting and stopping: the 5-hour window under 80%, the week under a hard 95%, and the weekly share above zero. The share caps total weekly use: autonomous work gets half of each day's unspent budget, rising only as your waking hours (outside 20:00–06:00) pass, so your own use keeps priority. A session starts only while usage is under all three; inside it, a hook warns on every tool call from 5 points below either window's limit (or when the share is nearly used up), then blocks every tool call at a limit. Every check fails closed. **Restarting** follows the queue plugin: a one-off timer wakes the autorun at the reset of whichever limit tripped, the 10-minute tick re-checks in between, and the restart resumes the same orchestrator session with its conversation.
- **Changing mediaserver is allowed, with guard rails.** The session reads mediaserver's own rules and known hazards first, commits every change in mediaserver's config repo, and applies one change at a time: validate, restart only that service, check it's healthy, and roll back automatically if not. Deleting household media or other services' data, anything that could cut the network or SSH, and household passwords go to the outbox instead, while other work continues. Every change shows in the recent decisions.

::: small muted
Development happens on the laptop, which has the RAM; recording and staging on mediaserver, always on with the real services. Recordings travel as scrubbed fixtures committed to the repo.
:::

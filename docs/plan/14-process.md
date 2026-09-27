---
id: process
nav: How the work runs
part: How it's built
---
## How the work runs

Most of what went wrong before was process, not code. These rules each answer a failure recorded in the old ROADMAP and HANDOVER.

| Failure before | Rule now |
|---|---|
| Fixtures written from docs; playback broken "since the client was written" | Adapters are only tested against recordings from mediaserver. No recording, no merge. A nightly re-record-and-diff catches upstream changes. |
| Code with nothing calling it (7 cases) | Every change names its plan item and the screen or job that uses it, and the milestone demo exercises it. Dead code fails lint (`knip` on web, detekt on Android). |
| Green CI that ran no tests (Gradle cache); unstyled screens passing | Android CI runs uncached tests plus an emulator smoke test; screenshot review replaces "testid exists" as the UI check. |
| Android written blind, a post-login crash nobody could see | Emulator in CI from M0; at each milestone, a build that arrives as an ordinary update through Droid-ify, with a one-tap crash report (logcat to the server). |
| `main` auto-deployed half-finished work to your daily container | Until you use Auralis, the container on mediaserver simply follows `main` as the test instance. Before "It plays" ships, `main` moves to `:edge` and only releases reach `:latest`, so from then on your daily container moves only when you've tried a milestone. |
| Parallel sessions colliding; 9,000 lines of handover | **No parallelism.** One Opus 5.5 orchestrator session keeps the big picture and never stops between items; all the work is done by Opus 5.5 subagents, strictly one at a time. Each task is sized so its subagent has enough context to understand it and never so much that its window grows large, splitting a plan item into parts where needed. Each part runs as a short sequence: plan, build, test (in a fresh context, against real recordings), and fix if the test failed, with the written plan and the test output as the hand-offs. No handover or status file: progress is computed from the repo at the start of every session (see "Staying on track"). History lives in git, not in docs. |
| Over-escalation, and "verified" claims that were wrong | Ordinary calls get made. Every status line says how it was checked (live, recording, code), like the "Where it stands" table on this page. |

### Autonomous runs

- **Started from the ThinkPad** by a timer every 10 minutes, as one orchestrator session in the repo, only when nothing else is working there.
- **Paused and resumed from any session on either host**, by asking Claude (the `auralis-autorun` skill). The switch is a file on mediaserver, so it works while the ThinkPad sleeps, and the timer itself is never toggled, so pausing can't break it. Pausing can also stop a running session; its conversation is kept.
- **Budget, the queue plugin's method:** the limits are the 5-hour window under 80%, the week under a hard 95%, and the time-aware weekly allowance above zero. Autonomous work gets half of each day's unspent budget, growing only as your waking hours (outside 20:00–06:00) run out, so your own use keeps priority. Every check fails closed. **One set of limits for starting and stopping**, held in one place: the 5-hour window under 80%, the week under 95%, and the weekly share above zero. A session starts only while usage is under them; inside a session a hook warns on every tool call from 5 points below either limit (or when the share is nearly used up), then blocks every tool call when usage reaches a limit. **Restarting** follows the queue plugin: a one-off timer wakes the autorun at the reset of whichever limit tripped, the 10-minute tick re-checks in between, and the restart resumes the same orchestrator session with its conversation.
- **Changing mediaserver is allowed, with guard rails.** The session reads mediaserver's own rules and known hazards first, commits every change in mediaserver's config repo, and applies one change at a time: validate, restart only that service, check it's healthy, and roll back automatically if not. Deleting household media or other services' data, anything that could cut the network or SSH, and household passwords go to the outbox instead, while other work continues. Every change shows in the recent decisions.

::: small muted
Where the work happens: development on SofiaThinkPad, which has the RAM. Recording and staging on mediaserver, which is always on and has the real services. Recordings travel as scrubbed fixture files committed to the repo.
:::

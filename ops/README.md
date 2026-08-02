# Ops — the cloud↔server handoff loop

The session building Auralis runs in an ephemeral cloud container. It cannot reach your
media server. Your local Claude session can reach the media server but is not the one
writing the code.

This directory is how they talk to each other, using the repo as the transport. Nothing
here needs a webhook, an open port, or a tunnel into your network.

```
   cloud session                    git                    your media server
   ─────────────                 ─────────                 ──────────────────
   writes ops/requests/0007-*.md  ──push──►  fetch  ──►  ops/auralis-agent.sh
                                                          notices a new request
                                                          runs `claude -p` on it
   reads ops/reports/0007-*.md   ◄──push──   commit ◄───  writes a report back
```

You set this up once. After that, when the cloud session pushes something that needs
deploying or testing on real hardware, your server picks it up on its own and reports back.

## Setup (once, on the media server)

```bash
git clone <this repo> /opt/auralis-src
cd /opt/auralis-src
git checkout claude/media-client-app-k7v9by

cp ops/auralis-agent.env.example ops/auralis-agent.env
$EDITOR ops/auralis-agent.env        # set REPO_DIR, BRANCH, CLAUDE_BIN

# Run it once by hand first, to see what it does before automating it.
./ops/auralis-agent.sh --once
```

Then automate it, either with the provided systemd units:

```bash
sudo cp ops/systemd/auralis-agent.service ops/systemd/auralis-agent.timer /etc/systemd/system/
sudo systemctl enable --now auralis-agent.timer
```

or with cron, if you prefer:

```
*/10 * * * * /opt/auralis-src/ops/auralis-agent.sh --once >> /var/log/auralis-agent.log 2>&1
```

## What it actually does

Every run, in order:

1. `git fetch` the working branch. If nothing moved, exit — no Claude invocation, no cost.
2. Look for files in `ops/requests/` with no matching file in `ops/reports/`.
3. For the oldest unanswered request, run Claude headlessly with `ops/agent-prompt.md` as
   the standing instruction and the request file as the task.
4. Claude does the work on your server — deploy the container, point it at your real
   Audiobookshelf, run the smoke checks the request asks for.
5. It writes `ops/reports/<same-number>-<slug>.md` and pushes.
6. The cloud session reads that report on its next hourly check and acts on it.

One request at a time, oldest first. A request is "answered" when a report with the same
number exists, so a failed run is retried on the next tick rather than lost.

## Safety

This runs an AI agent with tool access on your media server. Treat that seriously.

- **It is opt-in per run.** The timer can be stopped at any time
  (`systemctl stop auralis-agent.timer`) and nothing happens until you start it again.
- **It only ever executes requests from this repo's working branch.** If someone can push
  to that branch, they can run commands on your server — so keep the repo private and the
  branch protected.
- **Permissions are scoped, not blanket.** `ops/auralis-agent.env` sets `CLAUDE_ARGS`; the
  default allows the tools needed to build and run containers and **not**
  `--dangerously-skip-permissions`. Widen it only if you decide to.
- **It never touches your media.** Requests are scoped to deploying Auralis and reading
  its own logs. The request files are plain markdown — read one before you let it run.
- **Secrets stay out of the repo.** The agent is told to write credentials into
  `.env` files on the server and to redact them in reports.

If you would rather keep a human in the loop, run `./ops/auralis-agent.sh --once` yourself
whenever you feel like it and skip the timer entirely. The protocol works the same.

## Request and report format

Requests are numbered markdown files with a `## Goal`, `## Steps`, `## Acceptance` and
`## Report back` section. Reports mirror the number and answer each acceptance item with
an outcome and the evidence — command output, logs, or a screenshot path.

See `ops/requests/0001-example.md` for the shape.

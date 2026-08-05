#!/usr/bin/env bash
#
# Boots the web app the same way Playwright's `webServer` does
# (playwright.config.ts's second `webServer` entry: build @auralis/web, then run
# the BFF against `AURALIS_FAKE_UPSTREAMS=1` so no real Audiobookshelf/Jellyfin is
# needed), runs the Lighthouse performance budget against it, tears the server
# down, and exits with the budget script's own exit code.
#
# Deliberately a different port (4320) from Playwright's own webServer (4310):
# this script and a local `pnpm test:e2e` run must be able to coexist without
# colliding on the same port.
#
# Usage: scripts/lighthouse-budget.sh [-- <extra args passed to lighthouse-budget.mjs>]
set -euo pipefail

PORT="${LIGHTHOUSE_BUDGET_PORT:-4320}"
BASE="http://127.0.0.1:${PORT}"

SERVER_PID=""
SERVER_LOG=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    # Kill the whole process group, not just the recorded PID: `pnpm --filter
    # @auralis/server exec tsx src/main.ts` spawns tsx as a child, and a plain
    # `kill $SERVER_PID` would leave that child (and the Node process it starts)
    # running after this script exits, same trap docker-smoke.sh's SIGTERM
    # comment documents for the container's own Node process.
    kill -- "-$SERVER_PID" >/dev/null 2>&1 || kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  [ -n "$SERVER_LOG" ] && rm -f "$SERVER_LOG"
}
trap cleanup EXIT

echo "==> Building @auralis/web"
pnpm --filter @auralis/web build

SERVER_LOG="$(mktemp)"
echo "==> Booting the BFF on :$PORT (fake upstreams, in-memory data); its own request log -> $SERVER_LOG"
# Run in its own process group (setsid) so the trap above can kill the whole
# tree — tsx is a wrapper process, and killing only its PID leaves the real
# Node process (and anything it spawns) behind. Its stdout/stderr (Fastify's
# pino request log, one JSON line per request Lighthouse makes) is redirected
# to a file rather than left on the terminal — otherwise it drowns out the
# budget report this script exists to show.
PORT="$PORT" \
  DATA_DIR=':memory:' \
  SESSION_SECRET='lighthouse-budget-dev-secret-not-for-real-use' \
  AURALIS_FAKE_UPSTREAMS=1 \
  NODE_ENV=test \
  setsid pnpm --filter @auralis/server exec tsx src/main.ts >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

echo "==> Waiting for $BASE/api/v1/health"
ready=""
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "$BASE/api/v1/health"; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Server process exited before becoming ready. Its log follows:" >&2
    cat "$SERVER_LOG" >&2
    exit 1
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "Timed out after 120s waiting for $BASE/api/v1/health to answer. Server log follows:" >&2
  cat "$SERVER_LOG" >&2
  exit 1
fi

echo "==> Running the Lighthouse performance budget against $BASE"
# `set +e` around this one call: with `set -e` active, a non-zero exit here
# would abort the script before `exit_code=$?` ever ran, which would skip the
# `trap cleanup EXIT` teardown of the server process group.
set +e
node scripts/lighthouse-budget.mjs --url "$BASE" "$@"
exit_code=$?
set -e

exit "$exit_code"

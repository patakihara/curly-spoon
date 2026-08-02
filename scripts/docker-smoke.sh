#!/usr/bin/env bash
#
# Container smoke test — Phase 4's stated exit criterion (docs/ROADMAP.md § 4).
#
# The unit and Playwright suites both run the server from source, so neither
# says anything about the *image*: whether the multi-stage prune left it able to
# resolve its own modules, whether the built web app was actually copied in,
# whether the non-root user can write its volume, whether the healthcheck's
# command exists in the final layer. Every one of those is a "builds perfectly,
# dead on arrival" failure — the image's first boot found exactly that class of
# bug (pnpm's isolated node_modules layout), which is why this is a script that
# runs the real thing rather than a review of the Dockerfile.
#
# Runs against AURALIS_FAKE_UPSTREAMS=1, so it needs no Audiobookshelf. That flag
# is a supported runtime mode of the shipped server (apps/server/src/config.ts
# parses it alongside PORT), which is why the fake lives under `src/` and is
# present in the image.
#
# Usage: scripts/docker-smoke.sh [image-tag]
set -euo pipefail

IMAGE="${1:-auralis:smoke}"
CONTAINER="auralis-smoke-$$"
PORT="${AURALIS_SMOKE_PORT:-4311}"
BASE="http://127.0.0.1:${PORT}"
COOKIES="$(mktemp)"
FAILURES=0

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -f "$COOKIES"
}
trap cleanup EXIT

# `check <description> <expected> <actual>` — records rather than aborts, so one
# run reports every problem instead of only the first.
check() {
  if [ "$2" = "$3" ]; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s\n       expected: %s\n       actual:   %s\n' "$1" "$2" "$3"
    FAILURES=$((FAILURES + 1))
  fi
}

contains() {
  if printf '%s' "$3" | grep -qF -- "$2"; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FAIL %s\n       expected to contain: %s\n       actual:   %s\n' "$1" "$2" "$3"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "==> Building $IMAGE"
docker build -t "$IMAGE" .

echo "==> Booting $CONTAINER on :$PORT"
docker run -d --name "$CONTAINER" \
  -p "${PORT}:8787" \
  -e SESSION_SECRET='docker-smoke-only-not-a-real-secret-32' \
  -e AURALIS_FAKE_UPSTREAMS=1 \
  >/dev/null "$IMAGE"

# Wait on the container's own healthcheck rather than a bare port probe: it is
# the healthcheck that compose and any orchestrator will act on, so a container
# that answers curl but never reports `healthy` is still broken in production.
echo "==> Waiting for the container's HEALTHCHECK to report healthy"
health=''
for _ in $(seq 1 60); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo missing)"
  [ "$health" = 'healthy' ] && break
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != 'true' ]; then
    echo "  FAIL container exited before becoming healthy; logs follow:"
    docker logs "$CONTAINER" 2>&1 | tail -40
    exit 1
  fi
  sleep 2
done
check 'container reports healthy' 'healthy' "$health"

echo "==> The app itself"
check 'GET / serves the built web app' '200' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/")"
contains 'GET / is HTML' 'text/html' \
  "$(curl -s -o /dev/null -w '%{content_type}' "$BASE/")"
# The one thing that proves `apps/web/dist` was really copied in and hashed
# bundles resolve — an index.html referencing assets that 404 still returns 200.
asset="$(curl -s "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)"
check 'index.html references a hashed bundle' 'yes' "$([ -n "$asset" ] && echo yes || echo no)"
if [ -n "$asset" ]; then
  check 'the hashed bundle is served' '200' \
    "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$asset")"
  contains 'hashed bundles are immutable-cached' 'immutable' \
    "$(curl -sI "$BASE$asset" | tr -d '\r')"
fi
check 'an unknown path falls through to the SPA' '200' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/library/lib-books")"
# The SPA fallback must not swallow the API: an unknown /api path is a 404, not
# index.html, or every client bug becomes "why did I get HTML back".
check 'an unknown API path is still a 404' '404' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/no-such-route")"

echo "==> Authenticating end to end"
check 'health is reachable unauthenticated' '200' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/health")"
check 'libraries requires a session' '401' \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/libraries")"
contains 'setup probes the upstream and persists' '"configured":true' \
  "$(curl -s -X POST "$BASE/api/v1/setup" -H 'content-type: application/json' \
    -d '{"baseUrl":"http://fake.abs.local"}')"
contains 'login returns the signed-in user' '"username":"kara"' \
  "$(curl -s -c "$COOKIES" -X POST "$BASE/api/v1/auth/login" \
    -H 'content-type: application/json' -d '{"username":"kara","password":"hunter2"}')"
contains 'the session cookie reaches an authenticated route' '"id":"lib-books"' \
  "$(curl -s -b "$COOKIES" "$BASE/api/v1/libraries")"

echo "==> Shutdown"
# `docker stop` sends SIGTERM and waits 10s before SIGKILL. The Dockerfile's
# `CMD` runs tsx in exec form specifically so that signal reaches Node; if that
# reasoning ever stops holding, this takes the full grace period.
start="$(date +%s)"
docker stop "$CONTAINER" >/dev/null
elapsed=$(($(date +%s) - start))
if [ "$elapsed" -le 5 ]; then
  printf '  ok   SIGTERM is forwarded (stopped in %ss)\n' "$elapsed"
else
  printf '  FAIL docker stop took %ss — SIGTERM is not reaching the Node process\n' "$elapsed"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "Container smoke test passed."
else
  echo "Container smoke test failed: $FAILURES check(s)."
  docker logs "$CONTAINER" 2>&1 | tail -40 || true
fi
exit "$FAILURES"

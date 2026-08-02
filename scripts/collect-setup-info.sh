#!/usr/bin/env bash
#
# Auralis — media server intake.
#
# Read-only. Collects the facts Auralis needs in order to plug into an existing
# self-hosted media stack, and writes them to docs/setup/HOST_REPORT.md.
#
# It redacts as it goes: anything that looks like a password, token, API key or
# secret is replaced with «REDACTED». Read the output before committing it
# anyway — redaction is best-effort, and only you know what is sensitive.
#
# Usage:  ./scripts/collect-setup-info.sh [output-file]

set -uo pipefail

OUT="${1:-docs/setup/HOST_REPORT.md}"
mkdir -p "$(dirname "$OUT")"
: >"$OUT"

say() { printf '%s\n' "$*" >>"$OUT"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Best-effort scrubbing of secrets in anything we echo into the report.
redact() {
  sed -E \
    -e 's/((PASS|PASSWORD|PASSWD|SECRET|TOKEN|APIKEY|API_KEY|KEY|AUTH|CREDENTIAL)[A-Z_]*[=:][[:space:]]*)[^[:space:]"'"'"',]+/\1«REDACTED»/Ig' \
    -e 's#(https?://)[^:/@[:space:]]+:[^@[:space:]]+@#\1«REDACTED»@#g' \
    -e 's/\b[A-Fa-f0-9]{32,}\b/«REDACTED-HEX»/g'
}

section() {
  say ""
  say "## $1"
  say ""
}

say "# Host report"
say ""
say "Generated $(date -u '+%Y-%m-%d %H:%M UTC') by \`scripts/collect-setup-info.sh\`."
say "Secrets are redacted best-effort — **review before committing**."

# ─────────────────────────────────────────────────────────────────────────────
section "Host"

say '```'
say "os:      $(uname -srm 2>/dev/null)"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  say "distro:  $(. /etc/os-release && printf '%s' "${PRETTY_NAME:-unknown}")"
fi
say "arch:    $(uname -m 2>/dev/null)"
say "cpus:    $(nproc 2>/dev/null || echo '?')"
say "memory:  $(free -h 2>/dev/null | awk '/^Mem:/{print $2" total, "$7" available"}')"
say '```'

section "Disk layout"

say "Where the media actually lives matters more than total capacity — the request"
say "pipeline has to write into a path Audiobookshelf watches."
say ""
say '```'
df -h 2>/dev/null | grep -vE '^(tmpfs|devtmpfs|overlay|shm)' >>"$OUT"
say '```'

# ─────────────────────────────────────────────────────────────────────────────
section "Container runtime"

if have docker; then
  say '```'
  say "docker:  $(docker --version 2>/dev/null)"
  say "compose: $(docker compose version --short 2>/dev/null || echo 'not available')"
  say '```'
  say ""
  say "### Running containers"
  say ""
  say '```'
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null |
    redact >>"$OUT"
  say '```'
  say ""
  say "### Mounts, per container"
  say ""
  say "This is the important one: it shows which host paths each service can see, which"
  say "determines where downloads must land to be picked up."
  say ""
  say '```'
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    printf '%s\n' "$c" >>"$OUT"
    docker inspect -f '{{range .Mounts}}  {{.Source}} -> {{.Destination}} ({{.Mode}}){{"\n"}}{{end}}' \
      "$c" 2>/dev/null | redact >>"$OUT"
  done
  say '```'
  say ""
  say "### Networks"
  say ""
  say "Auralis needs to reach these services; if they share a user-defined bridge, it"
  say "should join it and use container names rather than host ports."
  say ""
  say '```'
  docker network ls 2>/dev/null >>"$OUT"
  say '```'
else
  say "_Docker not found. If the stack runs under Podman, systemd units or bare metal,"
  say "please describe it in \`MY_SETUP.md\` instead._"
fi

# ─────────────────────────────────────────────────────────────────────────────
section "Compose files"

say "Paste or reference the compose file(s) that define the stack. Search hints:"
say ""
say '```'
for d in /opt /srv /home /root /docker /mnt; do
  [ -d "$d" ] || continue
  find "$d" -maxdepth 4 \( -name 'docker-compose*.y*ml' -o -name 'compose*.y*ml' \) \
    -not -path '*/node_modules/*' 2>/dev/null
done | head -40 >>"$OUT"
say '```'
say ""
say "> Copy the relevant ones into \`docs/setup/compose/\`, **with secrets replaced**."

# ─────────────────────────────────────────────────────────────────────────────
section "Service reachability"

say "Probes only localhost-style URLs. Edit the list below if services live elsewhere."
say ""
say '```'
probe() {
  local name="$1" url="$2"
  if have curl; then
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 4 "$url" 2>/dev/null)
    printf '%-16s %-46s %s\n' "$name" "$url" "${code:-no-response}" >>"$OUT"
  fi
}
probe audiobookshelf "http://localhost:13378/healthcheck"
probe jellyfin       "http://localhost:8096/System/Info/Public"
probe qbittorrent    "http://localhost:8080/api/v2/app/version"
probe transmission   "http://localhost:9091/transmission/rpc"
probe prowlarr       "http://localhost:9696/api/v1/system/status"
probe lidarr         "http://localhost:8686/api/v1/system/status"
probe slskd          "http://localhost:5030/health"
probe navidrome      "http://localhost:4533/ping"
say '```'
say ""
say "A 401/403 means *reachable but needs auth* — that is a success for our purposes."

# ─────────────────────────────────────────────────────────────────────────────
section "Versions"

if have curl; then
  say '```'
  printf 'jellyfin:       ' >>"$OUT"
  curl -s --max-time 4 http://localhost:8096/System/Info/Public 2>/dev/null |
    tr ',' '\n' | grep -i '"Version"' | head -1 | redact >>"$OUT" || say '(unknown)'
  printf 'qbittorrent:    ' >>"$OUT"
  curl -s --max-time 4 http://localhost:8080/api/v2/app/version 2>/dev/null >>"$OUT" || true
  say ""
  say '```'
  say ""
  say "> Audiobookshelf reports its version at \`GET /api/status\` or in the web UI footer;"
  say "> add it to \`MY_SETUP.md\` — the API drifts between versions and our schemas care."
fi

say ""
say "---"
say ""
say "Now fill in \`docs/setup/MY_SETUP.md\` with the things this script cannot know."

printf 'Wrote %s\n' "$OUT"

#!/usr/bin/env python3
"""
Auralis — plan usage guard.

Reports the real utilisation of both plan windows and exits non-zero when either
is at or over the threshold. No estimation, no calibration, no accounting: it
asks the same endpoint the `/usage` command does and compares two numbers.

    ./scripts/usage-guard.py                  # report both windows
    ./scripts/usage-guard.py --threshold 0.9  # exit 1 at 90% (default)
    ./scripts/usage-guard.py --json           # machine-readable, incl. reset times

Exit codes:
    0  both windows under the threshold — or usage could not be read at all
    1  a window is at or over the threshold

## Why it fails open

An earlier version of this script estimated usage from local transcript files
and calibrated the estimate against a number a human read out of `/usage`. It
was wrong by a factor of thirty-three, because transcripts are filed per working
directory and it was only counting one of them. The lesson kept is not "estimate
better" but "do not estimate": a guard that reads the authoritative number is
either right or unavailable, and unavailable must never mean blocked. Every
failure path here — no credential, expired token, changed response shape,
network down — allows the work and says why on stderr.

## What it reads

`~/.claude/.credentials.json`, which holds the OAuth access token Claude Code
already maintains, and `GET /api/oauth/usage`. That endpoint is internal and
undocumented; it can change shape or disappear in any release, which is the
other reason for the paragraph above. The token is read at call time so token
refresh needs no handling here, and it is never written anywhere.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

CREDENTIALS = os.path.expanduser("~/.claude/.credentials.json")
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
WINDOWS = (("Session", "five_hour"), ("Weekly", "seven_day"))

# The endpoint rate-limits — HTTP 429, hit within a dozen calls while testing.
#
# The hooks themselves are infrequent: SessionStart fires once per session and
# the PreToolUse matcher only covers subagent spawns. The caller that actually
# repeats is the restart poller (scripts/auralis-autorun.sh), plus anyone
# iterating on this script. Both are enough to earn the cache.
#
# FRESH_SECONDS is how long a reading is reused without asking again;
# STALE_SECONDS is how long a cached reading is still preferable to no reading
# at all when the endpoint refuses. Utilisation moves by single digits over
# minutes, so a slightly old number is a far better input to a 90% gate than
# failing open is.
CACHE = os.path.expanduser("~/.cache/auralis-usage-guard.json")
FRESH_SECONDS = 60
STALE_SECONDS = 900


class Unavailable(Exception):
    """Usage could not be read. Always allows; never blocks."""


def access_token() -> str:
    try:
        with open(CREDENTIALS) as handle:
            data = json.load(handle)
    except OSError as err:
        raise Unavailable(f"cannot read {CREDENTIALS}: {err}") from err
    except json.JSONDecodeError as err:
        raise Unavailable(f"{CREDENTIALS} is not valid JSON: {err}") from err
    token = (data.get("claudeAiOauth") or {}).get("accessToken")
    if not isinstance(token, str) or not token:
        raise Unavailable("no claudeAiOauth.accessToken in the credentials file")
    return token


def read_cache() -> tuple[dict, float] | None:
    """(payload, age_seconds) from the last successful call, if any."""
    try:
        with open(CACHE) as handle:
            entry = json.load(handle)
        return entry["payload"], max(0.0, time.time() - float(entry["fetched_at"]))
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None


def write_cache(payload: dict) -> None:
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        tmp = f"{CACHE}.{os.getpid()}"
        with open(tmp, "w") as handle:
            json.dump({"fetched_at": time.time(), "payload": payload}, handle)
        os.replace(tmp, CACHE)
    except OSError:
        pass  # a guard that cannot cache still works, just noisier upstream


def fetch_usage(timeout: float, max_age: float = FRESH_SECONDS) -> dict:
    cached = read_cache()
    if cached and cached[1] <= max_age:
        return cached[0]
    try:
        payload = fetch_usage_uncached(timeout)
    except Unavailable:
        # Prefer a stale reading over none: the alternative is failing open,
        # which is strictly worse than acting on a number a few minutes old.
        if cached and cached[1] <= STALE_SECONDS:
            return cached[0]
        raise
    write_cache(payload)
    return payload


def fetch_usage_uncached(timeout: float) -> dict:
    request = urllib.request.Request(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {access_token()}",
            "anthropic-beta": "oauth-2025-04-20",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as err:
        # 401 is the expected shape of an expired token. Same handling as any
        # other failure: allow, and say so.
        raise Unavailable(f"usage endpoint returned HTTP {err.code}") from err
    except Exception as err:  # network, TLS, malformed JSON, anything
        raise Unavailable(f"usage endpoint unreachable: {err}") from err
    if not isinstance(payload, dict):
        raise Unavailable("usage endpoint returned an unexpected shape")
    return payload


def utilisation(payload: dict, key: str) -> tuple[float, datetime | None]:
    window = payload.get(key)
    if not isinstance(window, dict):
        raise Unavailable(f"no '{key}' window in the usage response")
    percent = window.get("utilization")
    if not isinstance(percent, (int, float)):
        raise Unavailable(f"'{key}' has no numeric utilization")
    resets = window.get("resets_at")
    when = None
    if isinstance(resets, str):
        try:
            when = datetime.fromisoformat(resets.replace("Z", "+00:00"))
        except ValueError:
            when = None
    return float(percent), when


def until(when: datetime | None, now: datetime) -> str:
    if when is None:
        return ""
    seconds = int((when - now).total_seconds())
    if seconds <= 0:
        return "resets now"
    days, seconds = divmod(seconds, 86400)
    hours, seconds = divmod(seconds, 3600)
    minutes = seconds // 60
    if days:
        return f"resets in {days}d{hours}h"
    if hours:
        return f"resets in {hours}h{minutes:02d}m"
    return f"resets in {minutes}m"


def bar(percent: float, width: int = 40) -> str:
    filled = max(0, min(width, round(width * percent / 100)))
    return "█" * filled + "·" * (width - filled)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threshold", type=float, default=0.90)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument(
        "--max-age",
        type=float,
        default=FRESH_SECONDS,
        metavar="SECONDS",
        help=f"reuse a cached reading younger than this (default {FRESH_SECONDS}s). "
        "0 forces a fresh call.",
    )
    parser.add_argument("--json", action="store_true")
    # Accepted and ignored: the PreToolUse hook passes it, and older callers may
    # too. Nothing here is project-scoped any more.
    parser.add_argument("--project", default=None, help=argparse.SUPPRESS)
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    ceiling = args.threshold * 100

    try:
        payload = fetch_usage(args.timeout, args.max_age)
        windows = [(label, *utilisation(payload, key)) for label, key in WINDOWS]
    except Unavailable as err:
        if args.json:
            print(json.dumps({"available": False, "reason": str(err), "over_threshold": False}))
        else:
            print(f"Plan usage unavailable — {err}", file=sys.stderr)
            print("Allowing: a guard that cannot measure must not block.", file=sys.stderr)
        return 0

    over = [label for label, percent, _ in windows if percent >= ceiling]

    if args.json:
        print(
            json.dumps(
                {
                    "available": True,
                    "threshold": args.threshold,
                    "over_threshold": bool(over),
                    "windows": {
                        label.lower(): {
                            "percent": percent,
                            "resets_at": when.isoformat() if when else None,
                            "seconds_until_reset": (
                                max(0, int((when - now).total_seconds())) if when else None
                            ),
                        }
                        for label, percent, when in windows
                    },
                },
                indent=2,
            )
        )
        return 1 if over else 0

    print(f"Plan usage  (ceiling {ceiling:.0f}%, checked {now:%Y-%m-%d %H:%M} UTC)")
    print()
    for label, percent, when in windows:
        flag = "  ← OVER" if percent >= ceiling else ""
        print(f"{label:<9} [{bar(percent)}] {percent:5.1f}%   {until(when, now)}{flag}")
    print()

    if over:
        print(f"STOP. {' and '.join(over)} at or over {ceiling:.0f}%.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

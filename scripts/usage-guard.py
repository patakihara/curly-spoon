#!/usr/bin/env python3
"""
Auralis — plan usage guard.

Subscription plans meter two rolling windows: a ~5-hour "session" window and a
weekly one. This reports how much of each window *this project* has consumed, so
development can be held to a share of the plan rather than eating all of it.

## The honest limitation

Nothing here can read the account's real usage. Plan limits are enforced
server-side and count every session, project and device on the account — this
script only sees local transcripts for this project. So it cannot know the
denominator on its own, and it is calibrated against the `/usage` command
instead:

    1. Run `/usage` in Claude Code and read the session percentage.
    2. ./scripts/usage-guard.py --calibrate-session 34
    3. ./scripts/usage-guard.py            # thereafter reports a projection

Calibration derives "how much project work equals one percent of the plan" and
stores it in .auralis-usage.json. Re-calibrate occasionally; it drifts as other
work lands on the account.

## The unit

Plan consumption is weighted by model — Opus costs far more of the allowance
than Sonnet for the same token count — and the exact weighting is not published.
Cost-equivalent tokens are used as the proxy, since published prices track
compute weight closely enough for a budget guard. Treat every figure as an
estimate with the calibration as its anchor, not as an authoritative reading.

Usage:
    ./scripts/usage-guard.py                       # report both windows
    ./scripts/usage-guard.py --calibrate-session 34
    ./scripts/usage-guard.py --calibrate-weekly 12
    ./scripts/usage-guard.py --threshold 0.8       # exit 1 at 80% (default)
    ./scripts/usage-guard.py --json

Exit codes:
    0  both windows under the threshold, or not yet calibrated
    1  a calibrated window is at or over the threshold — stop and check /usage
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

SESSION_WINDOW = timedelta(hours=5)
WEEKLY_WINDOW = timedelta(days=7)
STATE_FILE = ".auralis-usage.json"

# USD per million tokens; used only as a relative weight between models.
PRICES: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-fable-5": (10.00, 50.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
CACHE_READ_MULTIPLIER = 0.10
CACHE_WRITE_MULTIPLIER = 2.00  # 1-hour TTL, which long agent sessions use


def rates_for(model: str) -> tuple[float, float]:
    best, best_len = None, -1
    for prefix, price in PRICES.items():
        if model.startswith(prefix) and len(prefix) > best_len:
            best, best_len = price, len(prefix)
    # Unknown models weigh as Opus: over-estimating a budget is recoverable,
    # under-estimating it is how you discover the limit by hitting it.
    return best or PRICES["claude-opus-5"]


def family(model: str) -> str:
    """Coarse model family, matching how /usage reports its breakdown."""
    for name in ("opus", "sonnet", "haiku", "fable"):
        if name in model:
            return name
    return "other"


def weight(model: str, usage: dict, multipliers: dict[str, float] | None = None) -> float:
    """
    Plan-consumption weight of one turn.

    Published prices are the starting proxy, but plan allowance is *not* metered
    in dollars and weights the model families differently — measured against
    /usage, Opus counts roughly three times what its price ratio implies. The
    per-family multipliers correct for that and are derived from the breakdown
    /usage prints, via --calibrate-mix.
    """
    rate_in, rate_out = rates_for(model)
    per_in = rate_in / 1_000_000
    base = (
        (usage.get("input_tokens") or 0) * per_in
        + (usage.get("output_tokens") or 0) * (rate_out / 1_000_000)
        + (usage.get("cache_read_input_tokens") or 0) * per_in * CACHE_READ_MULTIPLIER
        + (usage.get("cache_creation_input_tokens") or 0) * per_in * CACHE_WRITE_MULTIPLIER
    )
    if multipliers:
        base *= multipliers.get(family(model), 1.0)
    return base


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def collect(
    project: str, multipliers: dict[str, float] | None = None
) -> list[tuple[datetime, str, float, int]]:
    """(timestamp, model, weight, raw_tokens) for every turn we can see."""
    slug = os.path.abspath(project).replace("/", "-")
    patterns = [
        os.path.expanduser(f"~/.claude/projects/{slug}/**/*.jsonl"),
        os.path.expanduser(f"~/.claude/projects/*{os.path.basename(project)}*/**/*.jsonl"),
        f"/tmp/claude-*/{slug}/**/tasks/*.output",
    ]
    paths: list[str] = []
    for pattern in patterns:
        for match in glob.glob(pattern, recursive=True):
            if match not in paths:
                paths.append(match)

    turns: list[tuple[datetime, str, float, int]] = []
    for path in paths:
        try:
            handle = open(path, errors="ignore")
        except OSError:
            continue
        with handle:
            for line in handle:
                if '"usage"' not in line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                message = record.get("message")
                if not isinstance(message, dict):
                    continue
                usage = message.get("usage")
                if not isinstance(usage, dict):
                    continue
                when = parse_time(record.get("timestamp"))
                if when is None:
                    continue
                model = message.get("model") or "(unknown)"
                raw = sum(
                    usage.get(key) or 0
                    for key in (
                        "input_tokens",
                        "output_tokens",
                        "cache_read_input_tokens",
                        "cache_creation_input_tokens",
                    )
                )
                turns.append((when, model, weight(model, usage, multipliers), raw))
    turns.sort(key=lambda item: item[0])
    return turns


def window_totals(
    turns: list[tuple[datetime, str, float, int]], window: timedelta, now: datetime
) -> tuple[float, int, dict[str, float]]:
    cutoff = now - window
    total, raw = 0.0, 0
    per_model: dict[str, float] = defaultdict(float)
    for when, model, value, tokens in turns:
        if when >= cutoff:
            total += value
            raw += tokens
            per_model[model] += value
    return total, raw, dict(per_model)


def load_state(project: str) -> dict:
    path = os.path.join(project, STATE_FILE)
    try:
        with open(path) as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(project: str, state: dict) -> None:
    with open(os.path.join(project, STATE_FILE), "w") as handle:
        json.dump(state, handle, indent=2)
        handle.write("\n")


def bar(fraction: float, width: int = 40) -> str:
    filled = max(0, min(width, round(width * fraction)))
    return "█" * filled + "·" * (width - filled)


def render(name: str, used: float, per_percent: float | None, threshold: float) -> bool:
    """Print one window; return True when it is at or over the threshold."""
    if not per_percent:
        print(f"{name:<9} {used:>8.2f} units   (not calibrated — run --calibrate-{name.lower()})")
        return False
    percent = used / per_percent
    over = percent >= threshold * 100
    flag = "  ← OVER" if over else ""
    print(f"{name:<9} [{bar(percent / 100)}] {percent:5.1f}% of plan{flag}")
    return over


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.getcwd())
    parser.add_argument("--threshold", type=float, default=0.80)
    parser.add_argument(
        "--calibrate-session",
        type=float,
        metavar="PCT",
        help="Percentage /usage currently reports for the 5-hour window.",
    )
    parser.add_argument(
        "--calibrate-weekly",
        type=float,
        metavar="PCT",
        help="Percentage /usage currently reports for the weekly window.",
    )
    parser.add_argument(
        "--calibrate-mix",
        metavar="SPEC",
        help='Model split /usage reports, e.g. "opus=59,sonnet=41". Derives per-family '
        "multipliers so the proxy matches how the plan actually meters each model.",
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    project = os.path.abspath(args.project)
    now = datetime.now(timezone.utc)
    state = load_state(project)

    if args.calibrate_mix:
        try:
            target = {
                k.strip().lower(): float(v)
                for k, v in (part.split("=") for part in args.calibrate_mix.split(","))
            }
        except ValueError:
            print('Bad --calibrate-mix; expected e.g. "opus=59,sonnet=41".')
            return 2
        observed: dict[str, float] = {}
        for _, model, value, _ in collect(project):
            observed[family(model)] = observed.get(family(model), 0.0) + value
        total_observed = sum(observed.get(k, 0.0) for k in target)
        total_target = sum(target.values())
        if total_observed <= 0 or total_target <= 0:
            print("Not enough observed usage to calibrate the mix.")
            return 2
        multipliers = {}
        for fam, share in target.items():
            seen = observed.get(fam, 0.0)
            if seen <= 0:
                continue
            multipliers[fam] = (share / total_target) / (seen / total_observed)
        # Normalise so the smallest multiplier is 1 — only ratios matter.
        floor = min(multipliers.values())
        state["family_multipliers"] = {k: round(v / floor, 4) for k, v in multipliers.items()}
        save_state(project, state)
        print("Calibrated model mix against /usage:")
        for fam, mult in sorted(state["family_multipliers"].items(), key=lambda kv: -kv[1]):
            print(f"  {fam:<8} counts {mult:.2f}x per proxy unit")
        print()

    multipliers = state.get("family_multipliers")
    turns = collect(project, multipliers)
    if not turns:
        print("No usage found for this project.")
        return 0

    session_used, session_raw, session_models = window_totals(turns, SESSION_WINDOW, now)
    weekly_used, weekly_raw, _ = window_totals(turns, WEEKLY_WINDOW, now)

    if args.calibrate_session is not None:
        if args.calibrate_session <= 0:
            print("Calibration percentage must be greater than zero.")
            return 2
        state["session_per_percent"] = session_used / args.calibrate_session
        save_state(project, state)
        print(f"Calibrated: {args.calibrate_session}% of the session window ≈ this project's last 5h.")
    if args.calibrate_weekly is not None:
        if args.calibrate_weekly <= 0:
            print("Calibration percentage must be greater than zero.")
            return 2
        state["weekly_per_percent"] = weekly_used / args.calibrate_weekly
        save_state(project, state)
        print(f"Calibrated: {args.calibrate_weekly}% of the weekly window ≈ this project's last 7d.")
    if args.calibrate_session is not None or args.calibrate_weekly is not None:
        print()

    session_per = state.get("session_per_percent")
    weekly_per = state.get("weekly_per_percent")

    if args.json:
        payload = {
            "threshold": args.threshold,
            "session": {
                "raw_tokens": session_raw,
                "percent_of_plan": (session_used / session_per) if session_per else None,
                "calibrated": bool(session_per),
            },
            "weekly": {
                "raw_tokens": weekly_raw,
                "percent_of_plan": (weekly_used / weekly_per) if weekly_per else None,
                "calibrated": bool(weekly_per),
            },
        }
        over = any(
            entry["percent_of_plan"] is not None
            and entry["percent_of_plan"] >= args.threshold * 100
            for entry in (payload["session"], payload["weekly"])
        )
        payload["over_threshold"] = over
        print(json.dumps(payload, indent=2))
        return 1 if over else 0

    print(f"Auralis plan usage  (threshold {args.threshold:.0%}, measured {now:%Y-%m-%d %H:%M} UTC)")
    print()
    session_over = render("Session", session_used, session_per, args.threshold)
    weekly_over = render("Weekly", weekly_used, weekly_per, args.threshold)
    print()
    print(f"Project tokens — last 5h: {session_raw:,}   last 7d: {weekly_raw:,}")
    if session_models:
        busiest = sorted(session_models.items(), key=lambda kv: -kv[1])
        share = ", ".join(f"{m.split('-2')[0]} {v / session_used * 100:.0f}%" for m, v in busiest[:3])
        print(f"Session mix — {share}")

    if not (session_per and weekly_per):
        print()
        print("Not fully calibrated. Run `/usage` in Claude Code, then:")
        print("  ./scripts/usage-guard.py --calibrate-session <pct> --calibrate-weekly <pct>")

    if session_over or weekly_over:
        print()
        print("STOP. A window is at or over the threshold.")
        print("This script cannot enforce anything — check /usage and pause the work.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

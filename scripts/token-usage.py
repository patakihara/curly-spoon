#!/usr/bin/env python3
"""
Auralis — token and spend accounting.

Reads Claude Code's local session transcripts and reports token usage and
estimated cost for this project, broken down by model, so development spend can
be watched against a budget.

This is a *reporting* tool. It cannot stop work — enforcement lives in the
account's spend limit at claude.ai/settings/usage, which is the only thing that
can actually halt a run. Use this to see where you are before you get there.

Usage:
    ./scripts/token-usage.py                    # report
    ./scripts/token-usage.py --budget 100       # report + exit 1 over 80% of $100
    ./scripts/token-usage.py --budget 100 --threshold 0.5
    ./scripts/token-usage.py --json             # machine-readable

Exit codes:
    0  under the threshold (or no budget given)
    1  at or over the threshold  -- usable from a hook or CI step
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import defaultdict
from dataclasses import dataclass, field

# Anthropic first-party rates, USD per million tokens.
#
# Cache economics: a cache read costs ~0.1x the base input rate. A cache write
# costs 1.25x at the 5-minute TTL and 2x at the 1-hour TTL -- which is why the
# TTL is a flag rather than a constant. Long agent sessions run on the 1-hour
# TTL, where writes are dearer but survive the gaps between turns.
PRICES: dict[str, tuple[float, float]] = {
    # model-id prefix -> (input $/MTok, output $/MTok)
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-fable-5": (10.00, 50.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}
CACHE_READ_MULTIPLIER = 0.10
CACHE_WRITE_MULTIPLIER = {"5m": 1.25, "1h": 2.00}
UNKNOWN = "(unknown model)"


@dataclass
class Usage:
    """Token counts for one model, summed across every turn we can see."""

    input: int = 0
    output: int = 0
    cache_read: int = 0
    cache_write: int = 0
    turns: int = 0

    def add(self, other: dict) -> None:
        self.input += other.get("input_tokens", 0) or 0
        self.output += other.get("output_tokens", 0) or 0
        self.cache_read += other.get("cache_read_input_tokens", 0) or 0
        self.cache_write += other.get("cache_creation_input_tokens", 0) or 0
        self.turns += 1

    @property
    def total(self) -> int:
        return self.input + self.output + self.cache_read + self.cache_write

    def cost(self, model: str, ttl: str) -> float:
        rate_in, rate_out = rates_for(model)
        write_multiplier = CACHE_WRITE_MULTIPLIER[ttl]
        per_token_in = rate_in / 1_000_000
        return (
            self.input * per_token_in
            + self.output * (rate_out / 1_000_000)
            + self.cache_read * per_token_in * CACHE_READ_MULTIPLIER
            + self.cache_write * per_token_in * write_multiplier
        )


def rates_for(model: str) -> tuple[float, float]:
    """Longest-prefix match, so dated snapshots resolve to their family's rate."""
    best: tuple[float, float] | None = None
    best_len = -1
    for prefix, price in PRICES.items():
        if model.startswith(prefix) and len(prefix) > best_len:
            best, best_len = price, len(prefix)
    # An unrecognised model is priced at Opus rates rather than zero: a silent
    # under-count is far more dangerous than a visible over-estimate when the
    # number is being used to decide whether to keep spending.
    return best if best else PRICES["claude-opus-5"]


@dataclass
class Report:
    by_model: dict[str, Usage] = field(default_factory=lambda: defaultdict(Usage))
    files_read: int = 0

    def scan(self, path: str) -> None:
        try:
            with open(path, errors="ignore") as handle:
                lines = handle.readlines()
        except OSError:
            return

        found = False
        for line in lines:
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
            model = message.get("model") or record.get("model") or UNKNOWN
            self.by_model[model].add(usage)
            found = True
        if found:
            self.files_read += 1

    def total_cost(self, ttl: str) -> float:
        return sum(usage.cost(model, ttl) for model, usage in self.by_model.items())

    def total_tokens(self) -> int:
        return sum(usage.total for usage in self.by_model.values())


def transcript_paths(project_dir: str) -> list[str]:
    """Main-session transcripts plus any subagent output logs."""
    slug = project_dir.replace("/", "-")
    patterns = [
        os.path.expanduser(f"~/.claude/projects/{slug}/**/*.jsonl"),
        os.path.expanduser(f"~/.claude/projects/*{os.path.basename(project_dir)}*/**/*.jsonl"),
        f"/tmp/claude-*/{slug}/**/tasks/*.output",
    ]
    seen: list[str] = []
    for pattern in patterns:
        for match in glob.glob(pattern, recursive=True):
            if match not in seen:
                seen.append(match)
    return seen


def human(number: int) -> str:
    return f"{number:,}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--budget", type=float, help="Budget in USD to measure against.")
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.80,
        help="Fraction of the budget that trips a non-zero exit (default 0.80).",
    )
    parser.add_argument(
        "--ttl",
        choices=sorted(CACHE_WRITE_MULTIPLIER),
        default="1h",
        help="Prompt-cache TTL, which sets the cache-write multiplier (default 1h).",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a table.")
    parser.add_argument(
        "--project",
        default=os.getcwd(),
        help="Project directory whose transcripts to read (default: cwd).",
    )
    args = parser.parse_args()

    report = Report()
    for path in transcript_paths(os.path.abspath(args.project)):
        report.scan(path)

    cost = report.total_cost(args.ttl)
    over = args.budget is not None and cost >= args.budget * args.threshold

    if args.json:
        print(
            json.dumps(
                {
                    "transcripts": report.files_read,
                    "cache_ttl": args.ttl,
                    "total_tokens": report.total_tokens(),
                    "estimated_cost_usd": round(cost, 2),
                    "budget_usd": args.budget,
                    "threshold": args.threshold,
                    "over_threshold": over,
                    "by_model": {
                        model: {
                            "turns": usage.turns,
                            "input": usage.input,
                            "output": usage.output,
                            "cache_read": usage.cache_read,
                            "cache_write": usage.cache_write,
                            "estimated_cost_usd": round(usage.cost(model, args.ttl), 2),
                        }
                        for model, usage in sorted(report.by_model.items())
                    },
                },
                indent=2,
            )
        )
        return 1 if over else 0

    if not report.by_model:
        print("No usage found. Transcripts may live elsewhere — pass --project.")
        return 0

    print(f"Auralis token usage  ({report.files_read} transcripts, cache TTL {args.ttl})")
    print()
    header = f"{'model':<24}{'turns':>7}{'output':>13}{'cache read':>14}{'cache write':>13}{'cost':>10}"
    print(header)
    print("-" * len(header))
    for model, usage in sorted(report.by_model.items(), key=lambda kv: -kv[1].cost(kv[0], args.ttl)):
        print(
            f"{model[:23]:<24}{usage.turns:>7}{human(usage.output):>13}"
            f"{human(usage.cache_read):>14}{human(usage.cache_write):>13}"
            f"{'$' + format(usage.cost(model, args.ttl), '.2f'):>10}"
        )
    print("-" * len(header))
    print(f"{'total':<24}{'':>7}{'':>13}{'':>14}{'':>13}{'$' + format(cost, '.2f'):>10}")
    print()
    print(f"Tokens seen: {human(report.total_tokens())} (cache reads bill at 10% of input)")

    if args.budget is not None:
        pct = cost / args.budget * 100 if args.budget else 0
        bar_width = 40
        filled = min(bar_width, int(bar_width * cost / args.budget)) if args.budget else 0
        bar = "█" * filled + "·" * (bar_width - filled)
        print(f"Budget:      ${cost:.2f} / ${args.budget:.2f}  [{bar}] {pct:.1f}%")
        if over:
            print()
            print(
                f"AT OR OVER {args.threshold:.0%} OF BUDGET. "
                "This script cannot stop work — lower the spend limit at "
                "claude.ai/settings/usage if you want a hard stop."
            )
    return 1 if over else 0


if __name__ == "__main__":
    sys.exit(main())

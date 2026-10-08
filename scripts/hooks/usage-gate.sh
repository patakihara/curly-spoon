#!/usr/bin/env bash
# The plan-usage gate for this repo is the shared autorun gate, run as the "auralis" instance.
# It lives in ~/.claude-shared/skills/autorun/ (gate.sh, its tests and SKILL.md), next to the
# launcher that starts this repo's autonomous sessions.
AUTORUN_INSTANCE=auralis exec "${HOME:-/home/sofiapata}/.claude-shared/skills/autorun/gate.sh"

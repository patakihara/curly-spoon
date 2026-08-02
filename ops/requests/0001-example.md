# Request 0001 — Example (never executed)

This file documents the request format. The runner skips it by name, so it will never be
acted on. Real requests start at `0002`.

## Goal

One paragraph. What outcome is wanted, and why it needs to happen on the media server
rather than in the cloud session. If the "why" is not "it needs real hardware, real
services or real data", the request probably should not exist.

## Context

What the cloud session already knows or assumes, so the server agent can tell when reality
disagrees. Name the specific assumptions worth checking.

## Steps

Numbered, concrete, and safe to re-run. Assume the agent has never seen this repo before.

1. `git pull` and confirm HEAD matches what the request expects.
2. …
3. …

Prefer commands over prose. Say explicitly when something is optional, and when something
must **not** be done.

## Acceptance

A checklist the report answers item by item. Each must be objectively verifiable — a
command's exit status, an HTTP status code, a string in a log — not a judgement call.

1. `docker compose ps` shows the container healthy.
2. `curl -fsS localhost:8787/api/v1/health` returns 200 with `"ok": true`.
3. …

## Report back

The specific facts the cloud session needs, beyond pass/fail. For example: the real shape
of an API response, the actual paths on disk, version numbers, timings, error text.

## Do not

Anything explicitly out of scope for this request — services not to touch, files not to
change, destructive operations not to attempt.

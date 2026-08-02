# Pending agent specs

Subagent specs that were **written but never launched** — usually because the plan-usage
gate closed first.

Writing a good spec is most of the work of delegating: the exact files, the exact API
surface, the assertions the tests must make, the explicit "do not touch" list. When a
session hits the ceiling holding one of those and it lives only in that session's context,
it is gone — and the session that replaces it starts cold and writes it again from scratch.

## How to use this

- Drop the spec here as `NN-short-name.md`, verbatim, as you would have passed it to the
  agent. Do not summarise it; a summary is not runnable.
- **Add it to `docs/HANDOVER.md` as the next TODO.** A file nobody is pointed at is the
  same as no file. The handover is `@`-imported into every session in this repo; this
  directory is not.
- Delete the file once its agent has run and the work has landed.

## Contents of a spec

The rules for scoping and writing these live in `CLAUDE.md` — in short: small enough to
finish in well under ~150 turns, precise enough that the agent never explores, with the
dependencies pre-installed and the manifests pre-created.

**This repo is public.** Specs must not name credentials, tokens or the user's hostnames.

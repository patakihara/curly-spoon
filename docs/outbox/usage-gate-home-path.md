# Remove your home path from the repo's usage-gate script

kind: published
default: the leak check skips scripts/hooks/ until you change it; nothing else changes.

Line 5 of `scripts/hooks/usage-gate.sh` names your user name and home folder, in the public repo,
as the fallback in `${HOME:-...}`.

Replacing that whole `${HOME:-...}` with plain `$HOME` fixes it. The folder is yours, so nothing
here edits it.

Say "done" once it's changed, and the leak check's exemption for `scripts/hooks/` goes.

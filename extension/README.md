# Sonora Design (VS Code extension)

Design System panel for this repo, hosted in a VS Code webview — the first phase of
feature parity with claude.ai/design's own Design System pane. See
`../docs/EXTENSION-PLAN.md` for the full plan; this covers what order 1.1 built.

## What it does

Two commands (Command Palette):

- **Sonora: Open Design System** (`sonora.openDesignSystem`) — makes sure
  `docs/serve.py` is answering on the configured port (starting it if nothing does,
  regenerating `gallery.html` first if that's missing), then opens a webview panel
  beside the editor framing `http://127.0.0.1:<port>/gallery.html` in an `<iframe>`.
  Reveals the existing panel instead of opening a second one if it's already open.
- **Sonora: Restart gallery server** (`sonora.restartServer`) — stops the
  `docs/serve.py` process this extension itself started (never one it merely found
  already running — see `extension/lib/server.js`) and starts a fresh one.

Settings (`Sonora` in VS Code Settings):

- `sonora.python` (default `python3`) — interpreter for `docs/serve.py` /
  `docs/gen_gallery.py`.
- `sonora.serverPort` (default `8888`) — port to probe/serve on. Note:
  `docs/serve.py` itself always binds `8888` (hardcoded, see its own docstring); this
  setting only changes what this extension probes and reports, so leave it at `8888`
  unless `docs/serve.py` is changed too.

The panel's HTML is a thin shell (`extension.js` builds it, `media/webview.js` runs
in it): a full-height `<iframe>` of the served gallery, and a Content-Security-Policy
that allows framing only that one loopback port and running only the nonce'd
`media/webview.js`. Framing the served page (rather than re-rendering it inside the
webview) keeps the gallery and its card `<iframe>`s same-origin, so the element
picker's `contentDocument` reach-in keeps working unchanged — see
`docs/EXTENSION-PLAN.md` §2 for why.

`media/webview.js` currently only relays `sonora:`-prefixed `postMessage` traffic
in both directions (iframe → host via `vscode.postMessage`, host → iframe via
`iframe.contentWindow.postMessage`). It does not yet interpret any message — order
1.2 adds the actual handlers (`sonora:open`, `sonora:toast`, `sonora:feedback`,
`sonora:edit-applied`, `sonora:reveal`, `sonora:reload`; see `docs/EXTENSION-PLAN.md`
§2's bridge-protocol table).

If `.claude-design-vendor/` is missing, `sonora.openDesignSystem` shows one clear
error naming it rather than doing anything else — that directory is gitignored and
this extension never fabricates it (`docs/EXTENSION-PLAN.md` §2 "What must stay
true").

## Install

```bash
bash extension/install.sh
```

Idempotent: symlinks the **main checkout's** `extension/` folder (never a worktree's
— worktrees are deleted after landing) into
`~/.vscode-server/extensions/opesus-local.sonora-design-0.1.0`, and adds/refreshes
that extension's entry in `~/.vscode-server/extensions/extensions.json` (the file VS
Code actually reads to find installed extensions — the symlink target alone is not
enough). Every other entry in that file is left byte-for-byte untouched; the write is
atomic (temp file + rename).

**Reload the window** afterwards (*Developer: Reload Window*) — VS Code only scans
`~/.vscode-server/extensions` at startup.

## The control endpoint

On activation this extension starts a small HTTP server on `127.0.0.1` (OS-assigned
port) and writes `~/.local/share/sonora-design/<pid>.json`:

```json
{ "port": 51234, "pid": 4242, "token": "…", "workspaceFolders": ["/home/…/sonora"], "startedAt": "…" }
```

deleted on deactivation, pruned automatically for any window whose pid has died. This
is claude-spotlight's own protocol (`opesus-local.claude-spotlight`'s `extension.js`),
unchanged except for the token header name: `POST /` with header `x-sonora-token` and
JSON body `{tool, args}`, reply `{ok: true, result}` or `{ok: false, error}`.

Tools today:

| tool | args | result |
| --- | --- | --- |
| `status` | none | `{panelOpen, serverUp, port, gallery}` — `gallery` is the HTTP status `gallery.html` answered with, or `0` |
| `openDesignSystem` | none | runs the command, then returns the same shape as `status` |

`extension/bin/sonora-ctl.js` is the terminal client — it finds the newest live
discovery file and POSTs to it:

```bash
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js status
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js openDesignSystem
```

(`node` is not on this machine's non-interactive `PATH` — see
`docs/EXTENSION-PLAN.md` §3.) This is the mechanism every work order's "check" is
verified through from a terminal, without needing to click anything by hand.

## What orders 1.2–1.4 add

- **1.2** — the actual `sonora:` message handlers on both sides (native
  `showTextDocument` instead of the `/_api/open` → `code` CLI hop, toasts, revealing
  an edited line), and framed-mode support in `docs/gallery.js`.
- **1.3** — a sidebar (`contributes.views`): a Groups → Cards tree and a Tokens list,
  plus a status bar item and the remaining build/check/regenerate commands.
- **1.4** — regeneration through the queue (`lib/queue.js`): a card's Feedback button
  files a queue item instead of shelling out to `claude -p` directly (this machine
  gates that — see `docs/EXTENSION-PLAN.md` §3), and polls it to completion.

## Verifying without clicking anything

```bash
node --check extension/extension.js extension/lib/*.js extension/media/webview.js extension/bin/sonora-ctl.js
bash extension/install.sh
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js status   # after a window has reloaded and activated
```

A real click — the panel visible, framing `gallery.html`, with the element picker
working inside a card preview — needs the user to reload her VS Code window; nothing
in this repo can exercise a live webview.

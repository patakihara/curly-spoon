# Sonora Design (VS Code extension)

Design System panel for this repo, hosted in the VS Code sidebar — feature parity
with claude.ai/design's own Design System pane. See `../docs/EXTENSION-PLAN.md` for
the full plan; this covers what orders 1.1–1.4 built.

## What it does

A "Sonora" icon in the activity bar opens a container with three views:

- **Design System** — a webview framing `http://127.0.0.1:<port>/gallery.html` in an
  `<iframe>`. This is a sidebar `WebviewView`, not a panel opened beside the editor —
  the sidebar is the only place this pane belongs (see `docs/EXTENSION-PLAN.md` §2).
- **Cards** — a tree, Groups → Cards. Clicking a card opens the Design System view
  (if it was closed) and scrolls/flashes that card into view. Right-click a card for
  "Open source" (`showTextDocument`) or "Copy path".
- **Tokens** — a tree, kind → token, with the token's value shown as its description.
  Colour tokens get a generated 16×16 SVG swatch as their icon.

Both trees refresh automatically on any change to `_ds_manifest.json`.

Commands (Command Palette):

- **Sonora: Open Design System** (`sonora.openDesignSystem`) — makes sure
  `docs/serve.py` is answering on the configured port (starting it if nothing does,
  regenerating `gallery.html` first if that's missing), then reveals the Design
  System view in the sidebar.
- **Sonora: Restart gallery server** (`sonora.restartServer`) — stops the
  `docs/serve.py` process this extension itself started (never one it merely found
  already running — see `extension/lib/server.js`) and starts a fresh one.
- **Sonora: Rebuild bundle** / **Render check** / **Check tokens** / **Pull design** —
  run `docs/build_bundle.js` / `docs/render_cards.mjs` / `docs/check_tokens.py` /
  `docs/design_pull.sh` in a reused terminal named "Sonora" so their output stays
  visible.
- **Sonora: Regenerate gallery** — runs `docs/gen_gallery.py` in the same terminal
  and, once it exits `0`, reloads the Design System view (via the terminal
  shell-integration API; if shell integration is off, it runs the command anyway and
  says so instead of guessing when it finished).
- **Sonora: Regenerate card…** (`sonora.regenerateCard`) — order 1.4's own command;
  see "What order 1.4 adds" below.

Settings (`Sonora` in VS Code Settings):

- `sonora.python` (default `python3`) — interpreter for `docs/serve.py` /
  `docs/gen_gallery.py` / `docs/check_tokens.py`.
- `sonora.serverPort` (default `8888`) — port to probe/serve on. Note:
  `docs/serve.py` itself always binds `8888` (hardcoded, see its own docstring); this
  setting only changes what this extension probes and reports, so leave it at `8888`
  unless `docs/serve.py` is changed too.
- `sonora.node` (default empty) — node executable for `docs/build_bundle.js` /
  `docs/render_cards.mjs`. Empty falls back to `~/.local/share/node22/bin/node` (node
  is not on this machine's non-interactive `PATH` — see `docs/EXTENSION-PLAN.md` §3).
- `sonora.regenerate` (default `queue`; `queue` / `claude` / `hold`) — how a card's
  Feedback button (or **Sonora: Regenerate card…**) is carried out; see "What order
  1.4 adds" below.

A status bar item ("Sonora: server up/down · bundle `<age>`") reports whether
`docs/serve.py` answers and how old `_ds_bundle.js` is; clicking it runs
`sonora.openDesignSystem`.

The Design System view's HTML is a thin shell (`extension.js` builds it,
`media/webview.js` runs in it): a full-height `<iframe>` of the served gallery, and a
Content-Security-Policy that allows framing only that one loopback port and running
only the nonce'd `media/webview.js`. Framing the served page (rather than
re-rendering it inside the webview) keeps the gallery and its card `<iframe>`s
same-origin, so the element picker's `contentDocument` reach-in keeps working
unchanged — see `docs/EXTENSION-PLAN.md` §2 for why.

`media/webview.js` only relays `sonora:`-prefixed `postMessage` traffic in both
directions (iframe → host via `vscode.postMessage`, host → iframe via
`iframe.contentWindow.postMessage`) — it never interprets a message itself.
`extension.js` handles `sonora:open`, `sonora:toast`, `sonora:edit-applied` and
`sonora:feedback` from the gallery (orders 1.2 and 1.4), and posts `sonora:reveal`
(Cards tree click), `sonora:reload` (after `sonora.regenerateGallery` or a queue-filed
regeneration landing) to it (orders 1.3 and 1.4); see `docs/EXTENSION-PLAN.md` §2's
bridge-protocol table.

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
| `status` | none | `{designSystemVisible, serverUp, port, gallery}` — `gallery` is the HTTP status `gallery.html` answered with, or `0` |
| `openDesignSystem` | none | runs the command, then returns the same shape as `status` |
| `reveal` | `{path}` | opens the Design System view if closed, posts `sonora:reveal` for that card path, returns `{revealed, ...status}` |
| `listCards` | none | `{groups, cards}` from `_ds_manifest.json` via `lib/manifest.js` — no HTTP round-trip to the gallery server needed |

`extension/bin/sonora-ctl.js` is the terminal client — it finds the newest live
discovery file and POSTs to it:

```bash
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js status
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js openDesignSystem
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js listCards
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js reveal '{"path":"ui_kits/desktop/index.html"}'
```

(`node` is not on this machine's non-interactive `PATH` — see
`docs/EXTENSION-PLAN.md` §3.) This is the mechanism every work order's "check" is
verified through from a terminal, without needing to click anything by hand.

## What order 1.4 adds

Regeneration through the queue (`lib/queue.js`): a card's Feedback button posts
`sonora:feedback` (framed mode) and the extension files a queue item instead of
shelling out to `claude -p` directly (this machine gates that — see
`docs/EXTENSION-PLAN.md` §3), then polls it to completion and reloads the card on a
`done`. **Sonora: Regenerate card…** (`sonora.regenerateCard`) does the same from the
command palette, picking a card from `_ds_manifest.json` if none is given. The
`sonora.regenerate` setting (`queue` default / `claude` / `hold`) controls which path
the request actually takes — see its own description in Settings.

## Verifying without clicking anything

```bash
node --check extension/extension.js extension/lib/*.js extension/media/webview.js extension/bin/sonora-ctl.js
node -e "const {loadManifest}=require('./extension/lib/manifest'); const m=loadManifest('_ds_manifest.json'); console.log(m.cardGroups.map(g=>[g.group,g.cards.length])); console.log(m.tokenGroups.map(k=>[k.kind,k.tokens.length]));"
bash extension/install.sh
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js status   # after a window has reloaded and activated
~/.local/share/node22/bin/node extension/bin/sonora-ctl.js listCards
```

A real click — the sidebar visible, the Design System view framing `gallery.html`,
the element picker working inside a card preview, a Cards-tree click scrolling to
the card — needs the user to reload her VS Code window; nothing in this repo can
exercise a live webview or tree view.

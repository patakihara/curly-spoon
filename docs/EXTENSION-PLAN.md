# Sonora in VS Code — Claude Design parity plan

Queue item 86fecc3 (main instance). This is the planning half of that item; the execution half
is the work orders in §4, filed into the `sonora` queue instance for sonnet owners once the queue
daemon can serve a second instance (§5 says why not before). Everything here is checkable
against a file in this repo or the queue repo; nothing is remembered from a chat.

## 1. What "feature parity with Claude Design" means here

Claude Design (claude.ai/design) is one product with four surfaces. Evidence for each row: the
vendored app chunk `.claude-design-vendor/ProjectPage-01b2KbqJ.js` (read via
`.probe/ctx_extract.py`), the captured DOM `.claude-design-vendor/page.html`, and the two reverse-
engineering write-ups `.probe/pro-panel-spec.md` and `.probe/writeback-design.md`. "Mirror today"
is what `docs/gen_gallery.py` + `docs/serve.py` + `docs/gallery.js` already do in a browser at
commit 530dec7.

| # | Claude Design feature | Mirror today (browser) | Extension target | Phase |
|---|---|---|---|---|
| A1 | Project page shell: chat pane · preview · **Design System** pane · files | **landed (1.1, 1.3):** the pane is a sidebar `WebviewView` in the "Sonora" activitybar container, framing the served `gallery.html` | Same pane, hosted in a sidebar `WebviewView` (not an editor-column panel — see §2); files = the editor itself | 1 |
| A2 | Project menu, "Back to projects", thumbnail upload, publish settings | dropped (no local backend) | Thumbnail = `thumbnail.html` open/edit; publish = n/a | 3 |
| B1 | Card groups (App Screens / Components / Guidelines / Reference / Brand) with live `<iframe>` previews scaled from the card's declared viewport | **landed (1.3):** the browser mirror plus a Cards tree (8 groups → 84 cards, click-to-reveal); iframe still at box width, not scaled | same + sidebar tree of groups→cards, click-to-reveal | 1 |
| B2 | **Edit** → opens the card source in the app's editor | **landed (1.2):** framed mode posts `sonora:open`, the host calls `showTextDocument`; `/_api/open` stays for the plain browser | native `vscode.window.showTextDocument`, line-accurate | 1 |
| B3 | **Feedback** → "Regenerate "<name>": <text>" + `ds-feedback` attachment posted to the project's Claude | **landed (1.4):** framed Feedback posts `sonora:feedback`, `lib/queue.js` files it via `bin/queue add` and polls `queue show` | file a queue item in the `sonora` instance, show its status on the card | 1 |
| B4 | Comment mode: hover-outline, click selects, `File/Element/Feedback` attachment with a 5-deep ancestor breadcrumb | **landed (1.1–1.2):** unchanged, and still same-origin inside the webview as §2 requires | unchanged — the gallery stays same-origin inside the webview (§2) | 1 |
| B5 | Add usage notes · group collapse · image attach on feedback | inert | usage notes → card `@dsCard` marker / manifest; image attach → `.feedback/<id>/` | 3 |
| B6 | Versions per card, `pinned` wins over newest (memory: reference-claude-design-version-pinning) | none (git only) | version list = `git log -- <card>`, "pin" = preview a past blob, badge when local ≠ remote | 3 |
| C1 | Property panel, **Simple / Pro / Code** modes; sections sizing·position·typography·layout·padding·margin·appearance·border·effects (+ tag-conditional ones) | six properties (display, gap, width, background, border-radius, font-weight) with scrub, undo/redo, token-aware writeback via `data-om-id` char offset | all sections of `.probe/pro-panel-spec.md` §1–2; Code mode = open the JSX at the element's offset | 2 |
| C2 | Writeback targets: card inline JSX (`style={{}}`) **and** component internals | card inline JSX only (`docs/edit_writeback.mjs`) | second path: `sx('…')` strings / `<style>` blocks in `components/**/*.jsx` (writeback-design.md §1) | 2 |
| C3 | Direct text editing (`data-om-text`) | none | JSXText / string-literal writeback by the same offset map | 2 |
| C4 | Drawing/annotation tools (rect, oval, arrow, line, freehand) over the preview | none | overlay canvas → PNG attached to the feedback item | 2 |
| C5 | Image slot picking / reframing; drag-drop repositioning | none | slot: swap `src` + `object-position`; reposition: flex `order` / grid-area edits — both through edit_writeback | 2 |
| D1 | Chat with the project's Claude: composer (attach image, voice, model picker, Send), streamed reply, "Edited N files", good/bad response | none | a chat view that files prompts into the `sonora` queue instance and renders that item's brief/notes/report + the resulting `git diff` — the queue *is* Claude on this machine | 3 |
| E1 | DesignSync pull/push from Claude Code (orchestrator-only tool; `finalize_plan` always prompts) | `docs/design_pull.sh` (pull); push done by hand in a live session | "Pull" runs design_pull.sh in a terminal; "Push" opens a terminal with the prepared prompt — the tool cannot be driven headlessly (memories: designsync-orchestrator-only, finalize-plan-always-asks) | 3 |
| E2 | Bundle build, token check, render check | **landed (1.3):** the same three as commands in a "Sonora" terminal, plus regenerate/restart/pull and a status bar item | commands + a status bar item; run on save of `tokens/*.css` / `components/**` | 1 |
| F1 | Export / share (`parts-*.js`, `selection-*.js`: screenshot + export plumbing) | `render_cards.mjs` screenshots into `.render/` | "Export card as PNG" (Playwright via render_cards) and "Export system as zip" | 3 |

Not parity, deliberately: Claude Design's account/workspace chrome, publishing to a public URL,
and its own model runtime. On this machine Claude reaches a repo only through the queue
(`hooks/queue_gate.py` files every prompt of a non-runner session), so every "ask Claude" feature
above is specified as "file a queue item and show its progress", never as a hidden `claude -p`.

## 2. Architecture

**Location:** `extension/` in this repo. Plain JavaScript, no bundler, no npm dependencies —
exactly the shape of the extension already installed on this machine
(`~/.vscode-server/extensions/opesus-local.claude-spotlight-0.3.0`: `package.json`,
`extension.js`, `lib/`, `media/`). Install = symlink the folder into
`~/.vscode-server/extensions/` and register it in that directory's `extensions.json` (VS Code
treats that file as the authoritative list; the symlink alone is not enough — see spotlight's
`install.ps1` header). `extension/install.sh` does both, idempotently.

**Runtime split:**

```
VS Code (Remote-WSL extension host, node 24)
 ├─ extension.js            commands, sidebar (trees + webview view), status bar, server lifecycle, queue bridge
 ├─ lib/server.js           finds/starts docs/serve.py on :8888 (idempotent — serve.py exits if bound)
 ├─ lib/manifest.js         reads _ds_manifest.json → groups/cards/tokens for the tree
 ├─ lib/queue.js            `python3 ~/.claude/skills/queue/bin/queue add …` with cwd = repo root
 └─ activitybar container "Sonora"
      ├─ WebviewView "Design System"     (webview, NOT a WebviewPanel/editor column — see 1.3)
      │    └─ media/webview.js   thin shell: <iframe src="http://127.0.0.1:8888/gallery.html">
      │                          + postMessage relay in both directions
      │                               └─ gallery.html + docs/gallery.js (unchanged rendering)
      │                                    └─ card <iframe>s — same origin as the gallery, so the
      │                                       picker keeps reaching into contentDocument directly
      ├─ TreeView "Cards"                group → card, click posts sonora:reveal to the webview view
      └─ TreeView "Tokens"               kind → token, colour tokens show an inline swatch
```

The Design System pane is a **WebviewView living in the "Sonora" activitybar container**,
never a `WebviewPanel` opened beside the editor — the sidebar is the only place a design-system
side panel belongs in an editor (user ruling, 2026-09-07; order 1.1 originally opened it with
`vscode.window.createWebviewPanel(..., ViewColumn.Beside)`, corrected by order 1.3 to
`vscode.window.registerWebviewViewProvider` inside the same container as the two trees below).
`sonora.openDesignSystem` reveals that view (`<viewId>.focus`, auto-registered by VS Code for
every contributed view) rather than opening/revealing a panel column.

Why an iframe of the served gallery rather than re-rendering the panel inside the webview: the
webview origin (`vscode-webview://…`) is foreign to the cards, so a panel drawn there would need
the injected-agent + postMessage protocol Claude Design itself uses for its picker — a rewrite of
the one part of the mirror that already works. Framing the whole served page keeps gallery ↔
cards same-origin, keeps `docs/gen_gallery.py`'s pixel-fidelity checks meaningful, and leaves one
code path for the browser and VS Code. The webview's CSP allows `frame-src http://127.0.0.1:8888`
only.

**Bridge protocol** (`docs/gallery.js` gains a framed mode: `window.parent !== window`):

| direction | message | effect |
|---|---|---|
| gallery → host | `{type:'sonora:open', path, line?}` | `showTextDocument` (replaces `/_api/open`; the `code` CLI hop stays for plain-browser use) |
| gallery → host | `{type:'sonora:toast', text}` | `window.showInformationMessage` |
| gallery → host | `{type:'sonora:feedback', name, path, text, element?, image?}` | file a queue item (§1 B3); reply with `{type:'sonora:feedback-filed', id}` |
| gallery → host | `{type:'sonora:edit-applied', path, offset, property}` | reveal the edited line in an open editor if any |
| host → gallery | `{type:'sonora:reveal', path}` | scroll the card into view and flash it |
| host → gallery | `{type:'sonora:reload', path?}` | reload one card iframe (or the page) after a save / a landed item |

**Settings** (`contributes.configuration`, prefix `sonora.`): `python` (default `python3`),
`node` (default: the extension host's own `process.execPath` — VS Code ships node, so
`docs/edit_writeback.mjs` never needs an external node; `~/.local/share/node22/bin/node` is the
fallback for the CLI scripts), `serverPort` (8888), `regenerate` = `queue` | `claude` | `hold`
(`queue` on this machine; `claude` keeps serve.py's `claude -p` for a machine without the queue;
`hold` = record in `.feedback/queue.jsonl` only, serve.py's `SONORA_FEEDBACK_CLAUDE=0`).

**What must stay true:** `gallery.html` renders identically with the extension absent (the
extension adds hooks, never rewrites captured markup — the standing rule in CLAUDE.md /
gen_gallery.py); nothing under `extension/` is part of the design system (it is never pushed;
`docs/design_pull.sh` and the manifest ignore it); the vendored app CSS stays gitignored, so the
extension regenerates `gallery.html` with `gen_gallery.py` when it is missing and says plainly
what is missing when `.claude-design-vendor/` is.

## 3. Facts an implementer must not re-derive

- The queue files every prompt of a session it did not spawn (`~/.claude/skills/queue/hooks/queue_gate.py`); a `claude -p` from a script becomes a queue item, not a run. Probe on 2026-09-06: item dbe25d2. Hence §1 B3/D1.
- `bin/queue add` is the user's own hand and is meant to be run by her tools at her click; it is refused during quiet hours except `add`, which is soft-held (`intent/fences.md`). The extension shows "held until 06:00" rather than an error.
- The queue's MCP `QueueAdd` routes to the instance selected by cwd (`match_prefix`), so the extension's `queue add` runs with `cwd = /home/sofiapata/src/sonora` to land in the `sonora` instance.
- `DesignSync` exists only in an interactive orchestrator session and prompts on `finalize_plan` every time; no extension command can push headlessly.
- `_ds_manifest.json` has no `versions`/`pinned`: a card pinned remotely renders an old version there while the mirror shows the newest — surface as a badge, never "fix".
- Cards import components from `_ds_bundle.js`; `data-om-id` offsets exist only for JSX written inline in the card. Component-internal styles are a second writeback path (§1 C2).
- serve.py binds 0.0.0.0:8888 (and :80 when unprivileged bind is allowed); gallery iframes need HTTP, never `file://`.
- Node for CLI scripts: `~/.local/share/node22/bin/node` (not on a non-interactive PATH); `@babel/parser` is resolved from the auralis-src pnpm store (see `docs/edit_writeback.mjs` `loadBabelParser`).

## 4. Work orders

One order = one sonnet owner session in the `sonora` instance, its own worktree, landed on
`master`. Each names its check; the check is a real click or a real run, never a mock
(memory: verify-against-real-input-not-mocks). File them in this order; 1.2–1.4 may run in
parallel once 1.1 has landed.

**1.1 Skeleton, install, panel.** — **landed** (`4a5fe91`, item f01fc61).  Create `extension/` (package.json: publisher `opesus-local`,
name `sonora-design`, `engines.vscode ^1.75`, `activationEvents: [workspaceContains:_ds_manifest.json]`,
command `sonora.openDesignSystem`), `extension.js`, `lib/server.js` (probe :8888, spawn
`python3 docs/serve.py` detached if unbound, never a second copy), `media/webview.js`
(iframe shell, CSP), `install.sh` (symlink + extensions.json entry, idempotent), `README.md`.
Check: run `install.sh`, reload the window, run the command → the panel shows gallery.html and the
picker outlines elements inside a card preview. (Order 1.1 opened this panel with
`createWebviewPanel(..., ViewColumn.Beside)`, an editor column; order 1.3 moved it into the
"Sonora" activitybar container as a `WebviewViewProvider` — see §2.)

**1.2 Bridge: Edit opens natively, toasts, edit-applied reveal.** — **landed** (`c63ccdb`, `2d198a4`, `b77f66a`; item 73df265).  Framed mode in `docs/gallery.js`
(§2 table, first four messages); host handlers. Keep `/_api/open` for the unframed browser.
Check: Edit on a card opens its file in an editor tab without the `code` CLI (kill it from PATH
in a terminal and prove it); a Pro-panel save reveals the changed line.

**1.3 Sidebar, and moving the panel into it.** — **landed** (`358ff73`, `1b5d0dc`, `5d0aeb1`, `6150350`; item ea69fb9, including the sidebar ruling c9311c0).  `contributes.viewsContainers.activitybar` "Sonora"
(`extension/media/sonora-icon.svg`), holding three views: the Design System `WebviewView` (moved
here from order 1.1's editor-column `WebviewPanel` — see §2), a Cards tree (Groups → Cards, click
posts `sonora:reveal`, opening the view first if closed; context menu: Open source, Copy path)
and a Tokens tree grouped by `kind` with the value as description (colour tokens get a generated
16×16 SVG data-URI swatch icon). Both trees refresh on a `FileSystemWatcher` for
`_ds_manifest.json`. Status bar item: server state + bundle age, click → `sonora.openDesignSystem`.
Commands, each in a dedicated "Sonora" terminal: `sonora.rebuildBundle`, `sonora.renderCheck`,
`sonora.checkTokens`, `sonora.regenerateGallery` (posts `sonora:reload` once
`docs/gen_gallery.py` exits 0, via the terminal shell-integration API), `sonora.restartServer`,
`sonora.pull` (`docs/design_pull.sh`). The loopback control endpoint (§4 "1.1") gains `reveal
{path}` and `listCards`. Check: clicking a card scrolls the panel to it; rebuild reports the card
count; `sonora-ctl.js listCards` returns all 84 cards grouped correctly.

**1.4 Regenerate through the queue.** — **landed** (`988a088`, `d4d300e`, `3e157d1`, `5163051`; item ca71c0c).  `lib/queue.js`: build the same sentence + attachment body
`docs/serve.py::build_prompt` builds, run `python3 ~/.claude/skills/queue/bin/queue add` with
cwd = repo root, parse "Filed as #id" / "held until"; card button reads "Filed #id" then polls
`queue show <id>` (read-only) every 30 s until done/failed; on done, `sonora:reload` that card.
`regenerate` setting as in §2. Check: submit feedback on one card → an entry appears in the
`sonora` instance (`queue list` from `~/src/sonora`), the card shows its id, and a landed run
reloads the preview.

### Phase 1 status (reviewed 2026-09-07, item e817a0f)

All four orders landed on `master`. Checks re-run from a clean worktree by the reviewer, not
taken from the orders' own reports:

| check | result |
|---|---|
| `node extension/test/check_build_prompt.mjs` | **passes** — `lib/queue.js` buildPrompt is byte-identical to `docs/serve.py::build_prompt` for all three entry shapes |
| `node docs/check_bridge.mjs` | **passes** — 10 assertions in a real browser: `sonora:open` carries the clicked card's path, `sonora:reveal` scrolls it into view, `sonora:feedback` carries text + picker element descriptor |
| `node extension/test/check_manifest.mjs` | **passes** — 84 cards across 8 groups, 206 tokens across 6 kinds, every alias colour resolved |
| `node --check` on every `extension/**/*.js` | **passes** |
| `extension/install.sh` | **passes**, idempotent; registers `opesus-local.sonora-design-0.1.0` → `/home/sofiapata/src/sonora/extension` |
| `node extension/bin/sonora-ctl.js status` | **cannot pass yet** — "no live discovery file": nothing writes it until a window runs the extension |

**Unverified until the user reloads her VS Code window** — no reviewer may claim these, since
every one of them needs the extension actually running: the panel appearing in the Sonora
sidebar and the picker outlining elements (1.1/1.3), Edit opening a file without the `code` CLI
hop (1.2), `sonora-ctl.js listCards` and `reveal` answering over the loopback endpoint (1.3),
and one real Feedback click filing a queue item and reloading the card on completion (1.4).
The headless checks above cover every part of those paths that does not need a live window.

Two things the review changed rather than reported. `extension/test/check_manifest.mjs` is new:
order 1.3's check ("`listCards` returns all 84 cards") needed a live window, so nothing
repeatable existed for the grouping. Writing it found a real defect — 19 alias colours
(`var(--state-success)`) and one gradient were inlined into an SVG `fill=`, painting a black
square that lied about the token's colour — fixed in `lib/manifest.js::resolveColor` (`7280efc`).

Known and not a phase-1 defect: `check_bridge.mjs` reports 7 page errors from the `ui_kits`
previews (`Cannot read properties of undefined (reading 'AppShell')`). That is the pre-existing
bundle/render race already filed as item 5d48f18, not the bridge.

**2.1 Pro panel: every section.** Extend `PROPS` in gallery.js and `docs/edit_writeback.mjs` to
the full spec table in `.probe/pro-panel-spec.md` (number/select/color/size/fill/shadow editors;
Simple hides sizing/position/layout/padding/margin per `lQ`). Check: the 30-assertion writeback
harness (`.probe/test-writeback.mjs`, extended per property) passes and `git diff --quiet` after
restore.

**2.2 Code mode.** "Code" tab = open the card at the element's `data-om-id` offset with the JSX
expression selected. Check: selection lands on the `style={{…}}` literal for three cards.

**2.3 Component-internal writeback.** Second locator: element → component name (from the bundle's
IIFE boundaries) → `sx('…')` string / `<style>` block in `components/**/*.jsx`, property edited
by name. Check: change a Button's padding from the panel; `git diff` touches only `Button.jsx`.

**2.4 Direct text editing.** Double-click text inside a preview → contenteditable → writeback of
the JSXText / string literal at the same offset map. Check: retitle a section header; the card
file changes at exactly that literal.

**2.5 Annotations.** Overlay canvas (rect/oval/arrow/line/freehand) captured to PNG under
`.feedback/<id>/annotation.png`, referenced from the queue item text. Check: a filed item names
the PNG and it opens.

**2.6 Image slots + repositioning.** Click an `<img>`/background slot → pick a file → `src`
writeback (+ `object-position` drag); drag a flex/grid child → `order`/`grid-area` writeback.
Check: swapping the album-art card's image changes one attribute in the file.

**3.1 Chat view.** Webview view "Claude" that files prompts (`queue add`) and renders the item's
updates (brief/notes/report) as they land, with "Edited N files" from `git diff --stat` of the
item's branch. Check: a prompt filed from the view shows up in `queue list` and its report
renders when done.

**3.2 Versions.** Per-card `git log`; "Preview this version" serves the blob through serve.py
(`/_git/<sha>/<path>`); "Pin" badge kept in `.vscode/sonora.pins.json` and shown on the card.
Check: previewing a two-commits-old card renders the old content.

**3.3 Usage notes, thumbnail, image attach.** Check: editing a card's notes rewrites its
`@dsCard` marker and `docs/update_manifest.py` reproduces the manifest byte-for-byte.

**3.4 Push.** Command opens a terminal with `claude` and a prepared DesignSync push prompt for the
changed files since the last pull (`docs/design_pull.sh` records it). Check: the prompt lists
exactly `git diff --name-only <last-pull>..HEAD`.

**3.5 Export.** PNG of one card via `docs/render_cards.mjs`, zip of the system without local
tooling. Check: the PNG matches the preview at the declared viewport.

## 5. Why the execution waits, and on what

The queue daemon on this machine runs exactly one instance (`bin/runner.py --instance main`,
machine-wide `daemon.lock`), and `main`'s project is the queue repo itself, so a sonnet owner
there gets a worktree of the wrong repo. A `sonora` instance is registered
(`devqueue.instances.json` and `~/.claude/state/queue/instances.json`, project_dir this repo,
automation `worker`). That enabler has since landed: the runner now serves `sonora`, phase 1's
four orders ran there as sonnet owners in their own worktrees, and all four are on `master`
(see the phase-1 status table in §4).

The standing routine, now that it works: file §4's orders into `sonora` (target_model sonnet),
in the stated order, from a session whose cwd is this repo; review each landing against its own
check, re-running that check rather than trusting the order's report; keep §1's "Mirror today"
column and §4 honest as rows move to done. One rule earned in phase 1: a check that needs a
live VS Code window can only ever be *half* verified headlessly, so every order should also
name the headless half, and a reviewer must say plainly which half still waits on the user's
window instead of quietly claiming it.

'use strict';
/**
 * Sonora Design — VS Code parity for the Design System pane of claude.ai/design
 * (docs/EXTENSION-PLAN.md §2, §4 "1.1"–"1.3"). Plain JS, no bundler, no npm dependencies —
 * mirrors opesus-local.claude-spotlight-0.3.0's shape exactly: vscode-free logic in
 * lib/, this file layers commands, the sidebar (tree views + the Design System webview
 * view), the status bar and the loopback control server on top, same as claude-spotlight
 * layers its extension.js over lib/core.js.
 *
 * The Design System panel lives in the "Sonora" activitybar container as a
 * WebviewViewProvider, alongside the Cards and Tokens trees — not a WebviewPanel in an
 * editor column. It frames the already-served gallery.html in an <iframe> rather than
 * re-rendering it inside the webview: the webview's own origin (vscode-webview://…) is
 * foreign to the cards, so drawing there would need the injected-agent + postMessage
 * protocol Claude Design itself uses for its picker. Framing the served page keeps
 * gallery ↔ card iframes same-origin — the one thing that already works — and CSP
 * limits framing to this one loopback port (§2 "Architecture").
 *
 * The loopback control endpoint (POST / with header x-sonora-token, body {tool, args})
 * is claude-spotlight's own protocol, unchanged: a discovery file at
 * ~/.local/share/sonora-design/<pid>.json advertises {port, pid, token,
 * workspaceFolders, startedAt}; extension/bin/sonora-ctl.js is this endpoint's terminal
 * client, the mechanism every work order's "check" verifies through (§4).
 */
const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { GalleryServer, probeGallery } = require('./lib/server');
const { discoveryDir, pruneStaleDiscoveryFiles } = require('./lib/discovery');
const queueLib = require('./lib/queue');
const { loadManifest } = require('./lib/manifest');

const MAX_BODY = 64 * 1024; // generous against a {tool, args} body; a guard, not a policy
const DESIGN_VIEW_ID = 'sonora.designSystemView';
const CARDS_VIEW_ID = 'sonora.cardsView';
const TOKENS_VIEW_ID = 'sonora.tokensView';
const DEFAULT_NODE = path.join(os.homedir(), '.local', 'share', 'node22', 'bin', 'node');
const STATUS_BAR_REFRESH_MS = 15000;

let output = null;
let extensionUri = null;
let globalStorageDir = null;
let galleryServer = null;
let controlServer = null;
let discoveryFile = null;

let designSystemView = null; // the resolved WebviewView, once the sidebar view has opened
let designSystemViewRendered = false; // whether .webview.html currently holds the gallery iframe
let designSystemViewReadyResolvers = [];

let cardsProvider = null;
let tokensProvider = null;
let statusBarItem = null;
let statusBarTimer = null;
let sonoraTerminal = null;

function log(msg) {
  if (output) output.appendLine(msg);
}

function workspaceFolderPaths() {
  return (vscode.workspace.workspaceFolders || [])
    .filter((f) => f.uri.scheme === 'file')
    .map((f) => f.uri.fsPath);
}

/** The workspace folder docs/serve.py and docs/gen_gallery.py must run from
 * (EXTENSION-PLAN.md §4 "1.1": "cwd = workspace folder containing _ds_manifest.json"). */
function findRepoRoot() {
  for (const folder of workspaceFolderPaths()) {
    if (fs.existsSync(path.join(folder, '_ds_manifest.json'))) return folder;
  }
  return null;
}

function requireRepoRootOrWarn() {
  const repoRoot = findRepoRoot();
  if (!repoRoot) vscode.window.showErrorMessage('Sonora: no open workspace folder contains _ds_manifest.json.');
  return repoRoot;
}

function readConfig() {
  const cfg = vscode.workspace.getConfiguration('sonora');
  return {
    python: cfg.get('python', 'python3'),
    port: cfg.get('serverPort', 8888),
    node: cfg.get('node', '') || DEFAULT_NODE,
    regenerate: cfg.get('regenerate', 'queue'),
  };
}

function serverLogPath() {
  return path.join(globalStorageDir, 'server.log');
}

function getOrCreateServer(repoRoot) {
  const { python, port } = readConfig();
  if (!galleryServer || galleryServer.cwd !== repoRoot || galleryServer.port !== port) {
    galleryServer = new GalleryServer({ python, port, cwd: repoRoot, logPath: serverLogPath(), log });
  }
  return galleryServer;
}

function nonce() {
  return crypto.randomBytes(16).toString('base64');
}

function escapeHtmlText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Thin shell: an <iframe> of the served gallery plus the postMessage relay script.
 * CSP allows only this one loopback port to be framed, and only the nonce'd
 * media/webview.js to run (EXTENSION-PLAN.md §4 "1.1" deliverable 3). The gallery's
 * origin is threaded through as a data attribute, never templated into an inline
 * script, so no 'unsafe-inline' is ever needed in script-src. Works for a WebviewPanel
 * or a WebviewView alike — both expose the same `.webview` shape this function needs. */
function buildPanelHtml(webview, port) {
  const n = nonce();
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'webview.js'));
  const galleryOrigin = `http://127.0.0.1:${port}`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${galleryOrigin}; script-src 'nonce-${n}';">
<style>html,body{margin:0;padding:0;height:100%;}iframe{width:100%;height:100%;border:0;display:block;}</style>
</head>
<body data-gallery-origin="${galleryOrigin}">
<iframe id="gallery" src="${galleryOrigin}/gallery.html"></iframe>
<script nonce="${n}" src="${scriptUri}"></script>
</body>
</html>`;
}

function emptyStateHtml(message) {
  return `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family,sans-serif);padding:1em;color:var(--vscode-errorForeground,#f88);">${escapeHtmlText(
    message
  )}</body></html>`;
}

// ---------------------------------------------------------------------------
// Design System sidebar view (WebviewViewProvider) — docs/EXTENSION-PLAN.md §4 "1.3":
// the panel 1.1 built as a WebviewPanel(ViewColumn.Beside) now lives here instead, as a
// view inside the "Sonora" activitybar container, beside the Cards and Tokens trees.
// ---------------------------------------------------------------------------

function markDesignSystemViewReady() {
  const resolvers = designSystemViewReadyResolvers;
  designSystemViewReadyResolvers = [];
  resolvers.forEach((r) => r());
}

function resolveDesignSystemWebviewView(webviewView) {
  designSystemView = webviewView;
  designSystemViewRendered = false;
  webviewView.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
  };
  const messageSub = webviewView.webview.onDidReceiveMessage((msg) => {
    const repoRoot = findRepoRoot();
    if (repoRoot) handleGalleryMessage(repoRoot, msg);
  });
  webviewView.onDidDispose(() => {
    messageSub.dispose();
    if (designSystemView === webviewView) {
      designSystemView = null;
      designSystemViewRendered = false;
    }
  });
  renderDesignSystemView().then(markDesignSystemViewReady);
}

/** Ensures docs/serve.py is answering, then (only if not already rendered) sets the
 * webview's html to the gallery iframe shell. Deliberately does not re-render on every
 * call — a card reveal must not reload the whole iframe each click; see revealCard(). */
async function renderDesignSystemView() {
  if (!designSystemView) return;
  if (designSystemViewRendered) return;
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    designSystemView.webview.html = emptyStateHtml('No open workspace folder contains _ds_manifest.json.');
    refreshStatusBar();
    return;
  }
  const server = getOrCreateServer(repoRoot);
  try {
    const { started } = await server.ensureRunning();
    if (started) log(`docs/serve.py started on :${server.port}`);
  } catch (e) {
    designSystemView.webview.html = emptyStateHtml(`Sonora: ${e.message}`);
    log(`error: ${e.message}`);
    refreshStatusBar();
    return;
  }
  designSystemView.webview.html = buildPanelHtml(designSystemView.webview, server.port);
  designSystemViewRendered = true;
  refreshStatusBar();
}

/** Force a fresh iframe shell next render (e.g. after restarting the server on a new
 * port) — the opposite of renderDesignSystemView()'s normal "render once" behaviour. */
async function forceRerenderDesignSystemView() {
  designSystemViewRendered = false;
  await renderDesignSystemView();
}

async function waitForDesignSystemView(timeoutMs) {
  if (designSystemView) return designSystemView;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(designSystemView), timeoutMs);
    designSystemViewReadyResolvers.push(() => {
      clearTimeout(timer);
      resolve(designSystemView);
    });
  });
}

/** Reveals the Design System view (opening the Sonora sidebar if it was closed) and
 * makes sure it is rendered. Returns the WebviewView on success, null otherwise. */
async function ensureDesignSystemViewOpen() {
  // VS Code auto-registers a `<viewId>.focus` command for every contributed view —
  // reveals the "Sonora" activitybar container and expands this view within it.
  await vscode.commands.executeCommand(`${DESIGN_VIEW_ID}.focus`);
  const view = await waitForDesignSystemView(8000);
  if (!view) return null;
  await renderDesignSystemView();
  return designSystemViewRendered ? view : null;
}

async function openDesignSystem() {
  const view = await ensureDesignSystemViewOpen();
  if (!view) vscode.window.showErrorMessage('Sonora: could not open the Design System view.');
}

/** Opens the panel first if it is closed (EXTENSION-PLAN.md §4 "1.3"), then posts the
 * reveal message the gallery's framed-mode handler already understands (docs/gallery.js,
 * order 1.2). Returns whether the message was sent. */
async function revealCard(cardPath) {
  const view = await ensureDesignSystemViewOpen();
  if (!view) {
    vscode.window.showErrorMessage('Sonora: could not open the Design System view to reveal the card.');
    return false;
  }
  view.webview.postMessage({ type: 'sonora:reveal', path: cardPath });
  return true;
}

// ---------------------------------------------------------------------------
// Gallery <-> host bridge (docs/EXTENSION-PLAN.md §2 "Bridge protocol", §4 "1.2").
// media/webview.js relays every 'sonora:'-prefixed postMessage from docs/gallery.js
// here unchanged; this is the only place that inspects message contents. Unchanged by
// the sidebar move — the WebviewView's `.webview` exposes the same onDidReceiveMessage
// shape a WebviewPanel's did.
// ---------------------------------------------------------------------------

function resolveCardPath(repoRoot, cardPath) {
  return path.isAbsolute(cardPath) ? cardPath : path.join(repoRoot, cardPath);
}

function findVisibleEditorFor(fsPath) {
  return vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath === fsPath) || null;
}

async function handleOpen(repoRoot, msg) {
  const fsPath = resolveCardPath(repoRoot, msg.path);
  let doc;
  try {
    doc = await vscode.workspace.openTextDocument(fsPath);
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: could not open ${msg.path}: ${e.message}`);
    return;
  }
  const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
  if (typeof msg.line === 'number' && msg.line > 0) {
    const lineIndex = Math.min(Math.max(msg.line - 1, 0), doc.lineCount - 1);
    const range = doc.lineAt(lineIndex).range;
    editor.selection = new vscode.Selection(range.start, range.start);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }
}

function handleToast(msg) {
  vscode.window.showInformationMessage(String(msg.text || ''));
}

function handleEditApplied(repoRoot, msg) {
  const fsPath = resolveCardPath(repoRoot, msg.path);
  const editor = findVisibleEditorFor(fsPath);
  if (!editor || typeof msg.offset !== 'number') return;
  // offset is a character offset (matches the data-om-id stamp docs/gallery.js reads it from),
  // not a byte offset — positionAt is exactly that same char-offset space, so no decoding needed.
  const offset = Math.min(Math.max(msg.offset, 0), editor.document.getText().length);
  const pos = editor.document.positionAt(offset);
  const range = editor.document.lineAt(pos.line).range;
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

async function handleGalleryMessage(repoRoot, msg) {
  if (!msg || typeof msg.type !== 'string') return;
  switch (msg.type) {
    case 'sonora:open':
      await handleOpen(repoRoot, msg);
      break;
    case 'sonora:toast':
      handleToast(msg);
      break;
    case 'sonora:edit-applied':
      handleEditApplied(repoRoot, msg);
      break;
    case 'sonora:feedback':
      await handleFeedback(repoRoot, msg);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Regenerate through the queue (docs/EXTENSION-PLAN.md §4 "1.4"). One entry point,
// handleFeedback, shared by the gallery's Feedback button (sonora:feedback above) and
// the sonora.regenerateCard command below — "the same path" the plan's own check
// names for both.
// ---------------------------------------------------------------------------

const REGEN_POLL_MS = 30 * 1000;
const REGEN_MAX_MS = 2 * 60 * 60 * 1000; // 2h, per the plan's own "stop after 2 h"

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Reply straight to the Design System webview view, when it's resolved and rendered.
 * A queue-filed run outlives it (the user can collapse the sidebar while regeneration
 * runs), so this is best-effort by design, never awaited for — postMessage into an
 * unresolved/disposed view throws, which is exactly the "nowhere to reply to" case
 * this swallows. */
function postToWebview(msg) {
  if (!designSystemView || !designSystemViewRendered) return;
  try {
    designSystemView.webview.postMessage(msg);
  } catch (e) {
    /* view disposed mid-flight */
  }
}

/** sonora.regenerate: "claude" — the framed page's feedback behaves as if unframed
 * for this one action (EXTENSION-PLAN.md §2 "Settings"): the request still reaches
 * docs/serve.py's own /_api/feedback, exactly the POST docs/gallery.js's unframed
 * submitFeedback makes, just issued by the host instead (the framed page never talks
 * to serve.py's HTTP API directly — see docs/gallery.js's FRAMED branch). */
function postFeedbackViaServe(port, entry) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({
      path: entry.path,
      name: entry.name,
      text: entry.text || '',
      element: entry.element || null,
    }), 'utf8');
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/_api/feedback',
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': body.length },
      },
      (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(out);
          } catch (e) {
            reject(new Error('docs/serve.py /_api/feedback: invalid JSON response'));
            return;
          }
          if (res.statusCode !== 200 || !parsed.ok) {
            reject(new Error((parsed && parsed.error) || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(parsed.entry);
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Polls `queue show <id>` every 30s (read-only — never files anything) until it
 * lands on done/failed, or 2h pass. A withProgress notification covers the wait; on
 * done, the card's preview is told to reload (it changed on disk); on failed, a
 * plain error toast — there is no per-card state left to update at this point, the
 * button's own "Filed #<id>" already reverted on its own timer. */
async function pollFeedbackRun(repoRoot, { id, name, path: cardPath }) {
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Sonora: regenerating ${name} (#${id})` },
    async () => {
      const deadline = Date.now() + REGEN_MAX_MS;
      while (Date.now() < deadline) {
        await sleep(REGEN_POLL_MS);
        let status;
        try {
          status = await queueLib.show(id, repoRoot);
        } catch (e) {
          log(`queue show ${id} failed: ${e.message}`);
          continue; // transient; the next tick retries, same tolerance as gallery.js's own poll()
        }
        if (status === null) continue; // refused during quiet hours — try again next tick
        if (status === 'done') {
          postToWebview({ type: 'sonora:reload', path: cardPath });
          return;
        }
        if (status === 'failed') {
          vscode.window.showErrorMessage(
            `Sonora: regenerating "${name}" failed — see \`queue show ${id}\` for details.`
          );
          return;
        }
        // todo / todo_answered / in_progress / blocked / ... — still moving, keep polling
      }
      log(`gave up polling queue item #${id} (${name}) after 2h`);
    }
  );
}

/** Files `entry` ({name, path, text, element?}) per the sonora.regenerate setting,
 * replies sonora:feedback-filed to the webview if one is open, and — only for the
 * `queue` mode, where there is an actual run to watch — starts pollFeedbackRun in
 * the background. Shared by handleGalleryMessage's sonora:feedback case and the
 * sonora.regenerateCard command. */
async function handleFeedback(repoRoot, entry) {
  const { regenerate: mode } = readConfig();
  let filed;
  try {
    if (mode === 'hold') {
      filed = queueLib.hold(entry, repoRoot);
    } else if (mode === 'claude') {
      const server = getOrCreateServer(repoRoot);
      await server.ensureRunning();
      const served = await postFeedbackViaServe(server.port, entry);
      filed = { id: served.id, held: served.status === 'held' ? true : undefined };
    } else {
      filed = await queueLib.add(entry, repoRoot);
    }
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: could not file feedback for "${entry.name}": ${e.message}`);
    log(`error filing feedback: ${e.message}`);
    return;
  }
  postToWebview({ type: 'sonora:feedback-filed', id: filed.id, held: filed.held });
  if (mode === 'queue') {
    pollFeedbackRun(repoRoot, { id: filed.id, name: entry.name, path: entry.path }); // not awaited: background
  }
}

/** _ds_manifest.json's own `cards` array ({path, name, group, ...}), read directly —
 * order 1.3 landed the Cards tree (lib/manifest.js) alongside this, but its own
 * context menu only names "Open source" and "Copy path" (EXTENSION-PLAN.md §4 "1.3"),
 * not a Regenerate item, so this QuickPick stays sonora.regenerateCard's only way to
 * pick a card from the command palette. `cardArg` below is ready for a future
 * context-menu item to pass {path, name} directly and skip this picker. */
async function pickCardFromManifest(repoRoot) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, '_ds_manifest.json'), 'utf8'));
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: could not read _ds_manifest.json: ${e.message}`);
    return null;
  }
  const items = (manifest.cards || []).map((c) => ({
    label: c.name,
    description: c.group,
    detail: c.path,
    card: { path: c.path, name: c.name },
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Regenerate which card?' });
  return picked ? picked.card : null;
}

/** Command sonora.regenerateCard (EXTENSION-PLAN.md §4 "1.4" deliverable 4): an
 * input box for the feedback text, then handleFeedback's own path — "the same path"
 * the plan's check names. `cardArg` is what a future caller with a card in hand could
 * pass directly; the command palette has no such argument, so it falls back to the
 * manifest QuickPick above. */
async function regenerateCard(cardArg) {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    vscode.window.showErrorMessage('Sonora: no open workspace folder contains _ds_manifest.json.');
    return;
  }
  let card = cardArg && cardArg.path ? { path: cardArg.path, name: cardArg.name || path.basename(cardArg.path) } : null;
  if (!card) {
    card = await pickCardFromManifest(repoRoot);
    if (!card) return; // cancelled
  }
  const text = await vscode.window.showInputBox({
    prompt: `Regenerate "${card.name}"`,
    placeHolder: 'What should change?',
  });
  if (text === undefined) return; // cancelled
  await handleFeedback(repoRoot, { name: card.name, path: card.path, text, element: null });
}

async function restartServer() {
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  // stop() only kills a process THIS extension started (lib/server.js) — a server
  // found already running (folder-open task, another window) is left untouched, and
  // this command simply re-probes/re-spawns around it.
  if (galleryServer) galleryServer.stop();
  galleryServer = null;
  const server = getOrCreateServer(repoRoot);
  try {
    await server.ensureRunning();
    vscode.window.showInformationMessage(`Sonora: gallery server answering on :${server.port}`);
    if (designSystemView) await forceRerenderDesignSystemView();
    else refreshStatusBar();
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: ${e.message}`);
    log(`error: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Manifest-backed sidebar trees (docs/EXTENSION-PLAN.md §4 "1.3") — grouping logic
// lives in lib/manifest.js (vscode-free); everything TreeItem-shaped lives here.
// ---------------------------------------------------------------------------

function manifestFilePath(repoRoot) {
  return path.join(repoRoot, '_ds_manifest.json');
}

function loadManifestSafe(repoRoot) {
  if (!repoRoot) return null;
  try {
    return loadManifest(manifestFilePath(repoRoot));
  } catch (e) {
    log(`manifest read failed: ${e.message}`);
    return null;
  }
}

function escapeXmlAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** A 16x16 SVG swatch of `value` as a data: URI TreeItem icon — the "inline swatch" the
 * work order asks for on colour tokens. No file is written; VS Code accepts a data: URI
 * as an icon path directly. */
function colorSwatchUri(value) {
  const safe = escapeXmlAttr(value);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">` +
    `<rect x="1" y="1" width="14" height="14" rx="3" fill="${safe}" stroke="rgba(128,128,128,0.65)"/></svg>`;
  return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

class CardGroupTreeItem extends vscode.TreeItem {
  constructor(group, cards) {
    super(group || '(ungrouped)', vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'sonora.group';
    this.description = String(cards.length);
    this.cards = cards;
  }
}

class CardTreeItem extends vscode.TreeItem {
  constructor(card) {
    super(card.name || card.path, vscode.TreeItemCollapsibleState.None);
    this.cardPath = card.path;
    this.description = card.viewport || '';
    this.tooltip = [card.subtitle, card.viewport].filter(Boolean).join('\n');
    this.contextValue = 'sonora.card';
    this.iconPath = new vscode.ThemeIcon('window');
    this.command = { command: 'sonora.revealCard', title: 'Reveal in Design System', arguments: [card.path] };
  }
}

class CardsTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.groups = [];
    this.message = 'Loading…';
  }
  refresh() {
    const repoRoot = findRepoRoot();
    const manifest = loadManifestSafe(repoRoot);
    this.groups = manifest ? manifest.cardGroups : [];
    if (manifest) this.message = this.groups.length ? null : 'The manifest has no cards.';
    else this.message = repoRoot ? 'Could not read _ds_manifest.json — see the Sonora output channel.' : 'No open workspace folder contains _ds_manifest.json.';
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  getChildren(el) {
    if (!el) {
      if (this.message) return [new vscode.TreeItem(this.message)];
      return this.groups.map((g) => new CardGroupTreeItem(g.group, g.cards));
    }
    if (el instanceof CardGroupTreeItem) return el.cards.map((c) => new CardTreeItem(c));
    return [];
  }
}

class TokenKindTreeItem extends vscode.TreeItem {
  constructor(kind, tokens) {
    super(kind || '(other)', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'sonora.tokenKind';
    this.description = String(tokens.length);
    this.tokens = tokens;
  }
}

class TokenTreeItem extends vscode.TreeItem {
  constructor(token) {
    super(token.name, vscode.TreeItemCollapsibleState.None);
    this.description = token.value;
    this.tooltip = `${token.name}: ${token.value}${token.definedIn ? `\n${token.definedIn}` : ''}`;
    this.contextValue = 'sonora.token';
    if (token.kind === 'color' && token.value) this.iconPath = colorSwatchUri(token.value);
  }
}

class TokensTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.kinds = [];
    this.message = 'Loading…';
  }
  refresh() {
    const repoRoot = findRepoRoot();
    const manifest = loadManifestSafe(repoRoot);
    this.kinds = manifest ? manifest.tokenGroups : [];
    if (manifest) this.message = this.kinds.length ? null : 'The manifest has no tokens.';
    else this.message = repoRoot ? 'Could not read _ds_manifest.json — see the Sonora output channel.' : 'No open workspace folder contains _ds_manifest.json.';
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(el) {
    return el;
  }
  getChildren(el) {
    if (!el) {
      if (this.message) return [new vscode.TreeItem(this.message)];
      return this.kinds.map((k) => new TokenKindTreeItem(k.kind, k.tokens));
    }
    if (el instanceof TokenKindTreeItem) return el.tokens.map((t) => new TokenTreeItem(t));
    return [];
  }
}

function setupManifestWatcher(context) {
  let watchers = [];
  function onChange() {
    if (cardsProvider) cardsProvider.refresh();
    if (tokensProvider) tokensProvider.refresh();
    refreshStatusBar();
  }
  function rebuild() {
    watchers.forEach((w) => w.dispose());
    watchers = [];
    for (const folder of vscode.workspace.workspaceFolders || []) {
      if (folder.uri.scheme !== 'file') continue;
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '_ds_manifest.json'));
      watcher.onDidChange(onChange);
      watcher.onDidCreate(onChange);
      watcher.onDidDelete(onChange);
      watchers.push(watcher);
    }
  }
  rebuild();
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(rebuild));
  context.subscriptions.push({ dispose: () => watchers.forEach((w) => w.dispose()) });
}

async function openCardSource(item) {
  const cardPath = item && item.cardPath;
  if (!cardPath) return;
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  const fsPath = resolveCardPath(repoRoot, cardPath);
  try {
    const doc = await vscode.workspace.openTextDocument(fsPath);
    await vscode.window.showTextDocument(doc, { preserveFocus: false });
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: could not open ${cardPath}: ${e.message}`);
  }
}

async function copyCardPath(item) {
  const cardPath = item && item.cardPath;
  if (!cardPath) return;
  await vscode.env.clipboard.writeText(cardPath);
  vscode.window.showInformationMessage(`Sonora: copied ${cardPath}`);
}

// ---------------------------------------------------------------------------
// Terminal-backed commands (docs/EXTENSION-PLAN.md §4 "1.3" deliverable 3) — every one
// runs in a single reused Terminal named "Sonora" so its output stays visible.
// ---------------------------------------------------------------------------

function quoteShellArg(s) {
  return /^[A-Za-z0-9_\-.\/]+$/.test(s) ? s : `'${String(s).replace(/'/g, "'\\''")}'`;
}

function getSonoraTerminal(cwd) {
  if (!sonoraTerminal) sonoraTerminal = vscode.window.createTerminal({ name: 'Sonora', cwd });
  return sonoraTerminal;
}

function runInSonoraTerminal(repoRoot, commandLine) {
  const terminal = getSonoraTerminal(repoRoot);
  terminal.show(true);
  terminal.sendText(commandLine);
}

async function rebuildBundle() {
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  const { node } = readConfig();
  runInSonoraTerminal(repoRoot, `${quoteShellArg(node)} docs/build_bundle.js`);
}

async function renderCheck() {
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  const { node } = readConfig();
  runInSonoraTerminal(repoRoot, `${quoteShellArg(node)} docs/render_cards.mjs`);
}

async function checkTokens() {
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  const { python } = readConfig();
  runInSonoraTerminal(repoRoot, `${quoteShellArg(python)} docs/check_tokens.py`);
}

async function pull() {
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  runInSonoraTerminal(repoRoot, 'bash docs/design_pull.sh');
}

/** Runs docs/gen_gallery.py in the Sonora terminal and, once it exits 0, posts
 * sonora:reload to the Design System view (docs/EXTENSION-PLAN.md §4 "1.3"). Needs the
 * terminal's shell-integration API to know when the command finished; falls back to a
 * fire-and-forget run with a toast explaining why no reload follows automatically if
 * shell integration is unavailable (e.g. the user disabled it). */
async function regenerateGallery() {
  const repoRoot = requireRepoRootOrWarn();
  if (!repoRoot) return;
  const { python } = readConfig();
  const commandLine = `${quoteShellArg(python)} docs/gen_gallery.py`;
  const terminal = getSonoraTerminal(repoRoot);
  terminal.show(true);
  if (!terminal.shellIntegration) {
    terminal.sendText(commandLine);
    vscode.window.showInformationMessage(
      "Sonora: shell integration is off, so the gallery can't auto-reload after this — run Sonora: Open Design System again once the terminal finishes."
    );
    return;
  }
  const execution = terminal.shellIntegration.executeCommand(commandLine);
  const sub = vscode.window.onDidEndTerminalShellExecution((e) => {
    if (e.execution !== execution) return;
    sub.dispose();
    if (e.exitCode === 0) {
      if (designSystemView) designSystemView.webview.postMessage({ type: 'sonora:reload' });
    } else {
      vscode.window.showWarningMessage(`Sonora: docs/gen_gallery.py exited ${e.exitCode} — gallery not reloaded.`);
    }
  });
}

// ---------------------------------------------------------------------------
// Status bar (docs/EXTENSION-PLAN.md §4 "1.3" deliverable 4).
// ---------------------------------------------------------------------------

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function refreshStatusBar() {
  if (!statusBarItem) return;
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    statusBarItem.text = 'Sonora: no workspace';
    statusBarItem.tooltip = 'No open workspace folder contains _ds_manifest.json.';
    return;
  }
  const { port } = readConfig();
  const gallery = await probeGallery(port);
  const up = gallery === 200;
  let age = 'missing';
  try {
    const stat = fs.statSync(path.join(repoRoot, '_ds_bundle.js'));
    age = formatAge(Date.now() - stat.mtimeMs);
  } catch (e) {
    /* no bundle yet */
  }
  statusBarItem.text = `Sonora: server ${up ? 'up' : 'down'} · bundle ${age}`;
  statusBarItem.tooltip = 'Click to open the Sonora Design System view';
}

function setupStatusBar(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'sonora.openDesignSystem';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();
  refreshStatusBar();
  statusBarTimer = setInterval(refreshStatusBar, STATUS_BAR_REFRESH_MS);
  context.subscriptions.push({
    dispose: () => {
      clearInterval(statusBarTimer);
      statusBarTimer = null;
    },
  });
}

// ---------------------------------------------------------------------------
// Loopback control endpoint — protocol mirrors claude-spotlight exactly (its
// extension.js header comment), swapping only the token header name and tool set.
// `reveal` and `listCards` (docs/EXTENSION-PLAN.md §4 "1.3" deliverable 5) let
// extension/bin/sonora-ctl.js drive and inspect the sidebar without clicking anything.
// ---------------------------------------------------------------------------

async function controlStatus() {
  const { port } = readConfig();
  const gallery = await probeGallery(port);
  return {
    designSystemVisible: !!(designSystemView && designSystemView.visible),
    serverUp: gallery === 200,
    port,
    gallery: gallery || 0,
  };
}

function controlListCards() {
  const repoRoot = findRepoRoot();
  const manifest = loadManifestSafe(repoRoot);
  if (!manifest) return { groups: [], cards: [] };
  const groups = [];
  const cards = [];
  for (const g of manifest.cardGroups) {
    groups.push(g.group);
    for (const c of g.cards) cards.push({ path: c.path, group: g.group, name: c.name, subtitle: c.subtitle, viewport: c.viewport });
  }
  return { groups, cards };
}

async function controlDispatch(payload) {
  const tool = payload && payload.tool;
  const args = (payload && payload.args) || {};
  switch (tool) {
    case 'status':
      return await controlStatus();
    case 'openDesignSystem':
      await vscode.commands.executeCommand('sonora.openDesignSystem');
      return await controlStatus();
    case 'reveal': {
      if (typeof args.path !== 'string' || !args.path) throw new Error('reveal requires args.path (string)');
      const revealed = await revealCard(args.path);
      return { revealed, ...(await controlStatus()) };
    }
    case 'listCards':
      return controlListCards();
    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function createControlServer(token) {
  return http.createServer((req, res) => {
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'Only POST is supported' });
      return;
    }
    if (req.headers['x-sonora-token'] !== token) {
      sendJson(res, 403, { ok: false, error: 'Bad or missing token' });
      return;
    }
    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        sendJson(res, 413, { ok: false, error: 'Body too large' });
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', async () => {
      if (aborted) return;
      let payload;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        sendJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }
      try {
        const result = await controlDispatch(payload);
        sendJson(res, 200, { ok: true, result });
      } catch (e) {
        sendJson(res, 200, { ok: false, error: String((e && e.message) || e) });
      }
    });
  });
}

function writeDiscoveryFile(dir, port, token) {
  const info = {
    port,
    pid: process.pid,
    token,
    workspaceFolders: workspaceFolderPaths(),
    startedAt: new Date().toISOString(),
  };
  const file = path.join(dir, `${process.pid}.json`);
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(info, null, 2), 'utf8');
    fs.renameSync(tmp, file); // atomic — readers never see a half-written file
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (e2) {
      /* ignore */
    }
    return null;
  }
  return file;
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

function activate(context) {
  extensionUri = context.extensionUri;
  globalStorageDir = context.globalStorageUri ? context.globalStorageUri.fsPath : os.tmpdir();
  try {
    fs.mkdirSync(globalStorageDir, { recursive: true });
  } catch (e) {
    globalStorageDir = os.tmpdir();
  }

  output = vscode.window.createOutputChannel('Sonora');
  context.subscriptions.push(output);

  // Commands must exist even if the control server below fails to bind.
  context.subscriptions.push(vscode.commands.registerCommand('sonora.openDesignSystem', openDesignSystem));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.restartServer', restartServer));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.regenerateCard', regenerateCard));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.rebuildBundle', rebuildBundle));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.renderCheck', renderCheck));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.checkTokens', checkTokens));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.regenerateGallery', regenerateGallery));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.pull', pull));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.revealCard', revealCard));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.openCardSource', openCardSource));
  context.subscriptions.push(vscode.commands.registerCommand('sonora.copyCardPath', copyCardPath));

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DESIGN_VIEW_ID,
      { resolveWebviewView: resolveDesignSystemWebviewView },
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  cardsProvider = new CardsTreeProvider();
  tokensProvider = new TokensTreeProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider(CARDS_VIEW_ID, cardsProvider));
  context.subscriptions.push(vscode.window.registerTreeDataProvider(TOKENS_VIEW_ID, tokensProvider));
  cardsProvider.refresh();
  tokensProvider.refresh();
  setupManifestWatcher(context);

  setupStatusBar(context);
  context.subscriptions.push(vscode.window.onDidCloseTerminal((t) => {
    if (t === sonoraTerminal) sonoraTerminal = null;
  }));

  const dir = discoveryDir(process.env, os.homedir());
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    log(`could not create discovery dir ${dir}: ${e.message}`);
    return;
  }
  pruneStaleDiscoveryFiles(dir, process.pid);

  const token = crypto.randomBytes(24).toString('hex');
  controlServer = createControlServer(token);
  controlServer.on('error', () => {
    /* never disturb the window */
  });
  controlServer.listen(0, '127.0.0.1', () => {
    const port = controlServer.address().port;
    discoveryFile = writeDiscoveryFile(dir, port, token);
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => writeDiscoveryFile(dir, port, token))
    );
  });
}

function deactivate() {
  try {
    if (discoveryFile) fs.unlinkSync(discoveryFile);
  } catch (e) {
    /* ignore */
  }
  try {
    if (controlServer) controlServer.close();
  } catch (e) {
    /* ignore */
  }
  try {
    if (galleryServer) galleryServer.stop();
  } catch (e) {
    /* ignore */
  }
}

module.exports = { activate, deactivate };

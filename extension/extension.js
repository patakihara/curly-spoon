'use strict';
/**
 * Sonora Design — VS Code parity for the Design System pane of claude.ai/design
 * (docs/EXTENSION-PLAN.md §2, §4 "1.1"). Plain JS, no bundler, no npm dependencies —
 * mirrors opesus-local.claude-spotlight-0.3.0's shape exactly: vscode-free logic in
 * lib/, this file layers commands, the webview panel and the loopback control server
 * on top, same as claude-spotlight layers its extension.js over lib/core.js.
 *
 * The panel frames the already-served gallery.html in an <iframe> rather than
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

const MAX_BODY = 64 * 1024; // generous against a {tool, args} body; a guard, not a policy

let output = null;
let extensionUri = null;
let globalStorageDir = null;
let panel = null;
let galleryServer = null;
let controlServer = null;
let discoveryFile = null;

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

function readConfig() {
  const cfg = vscode.workspace.getConfiguration('sonora');
  return {
    python: cfg.get('python', 'python3'),
    port: cfg.get('serverPort', 8888),
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

/** Thin shell: an <iframe> of the served gallery plus the postMessage relay script.
 * CSP allows only this one loopback port to be framed, and only the nonce'd
 * media/webview.js to run (EXTENSION-PLAN.md §4 "1.1" deliverable 3). The gallery's
 * origin is threaded through as a data attribute, never templated into an inline
 * script, so no 'unsafe-inline' is ever needed in script-src. */
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

async function openDesignSystem() {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    vscode.window.showErrorMessage('Sonora: no open workspace folder contains _ds_manifest.json.');
    return;
  }

  const server = getOrCreateServer(repoRoot);
  try {
    const { started } = await server.ensureRunning();
    if (started) log(`docs/serve.py started on :${server.port}`);
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: ${e.message}`);
    log(`error: ${e.message}`);
    return;
  }

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'sonoraDesignSystem',
    'Design System',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
    }
  );
  panel.webview.html = buildPanelHtml(panel.webview, server.port);
  const messageSub = panel.webview.onDidReceiveMessage((msg) => handleGalleryMessage(repoRoot, msg));
  panel.onDidDispose(() => {
    messageSub.dispose();
    panel = null;
  });
}

// ---------------------------------------------------------------------------
// Gallery <-> host bridge (docs/EXTENSION-PLAN.md §2 "Bridge protocol", §4 "1.2").
// media/webview.js relays every 'sonora:'-prefixed postMessage from docs/gallery.js
// here unchanged; this is the only place that inspects message contents.
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
    default:
      // sonora:feedback etc. land in later work orders (§4 "1.4").
      break;
  }
}

async function restartServer() {
  const repoRoot = findRepoRoot();
  if (!repoRoot) {
    vscode.window.showErrorMessage('Sonora: no open workspace folder contains _ds_manifest.json.');
    return;
  }
  // stop() only kills a process THIS extension started (lib/server.js) — a server
  // found already running (folder-open task, another window) is left untouched, and
  // this command simply re-probes/re-spawns around it.
  if (galleryServer) galleryServer.stop();
  galleryServer = null;
  const server = getOrCreateServer(repoRoot);
  try {
    await server.ensureRunning();
    vscode.window.showInformationMessage(`Sonora: gallery server answering on :${server.port}`);
  } catch (e) {
    vscode.window.showErrorMessage(`Sonora: ${e.message}`);
    log(`error: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Loopback control endpoint — protocol mirrors claude-spotlight exactly (its
// extension.js header comment), swapping only the token header name and tool set.
// ---------------------------------------------------------------------------

async function controlStatus() {
  const { port } = readConfig();
  const gallery = await probeGallery(port);
  return { panelOpen: !!panel, serverUp: gallery === 200, port, gallery: gallery || 0 };
}

async function controlDispatch(payload) {
  const tool = payload && payload.tool;
  switch (tool) {
    case 'status':
      return await controlStatus();
    case 'openDesignSystem':
      await vscode.commands.executeCommand('sonora.openDesignSystem');
      return await controlStatus();
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

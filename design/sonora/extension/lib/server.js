'use strict';
/**
 * Sonora Design — vscode-free gallery-server lifecycle (docs/EXTENSION-PLAN.md §4 "1.1").
 *
 * Finds or starts docs/serve.py on the configured port, the same server the folder-open
 * VS Code task already starts by hand (docs/serve.py's own docstring). serve.py is
 * idempotent by itself — main() calls already_running() and exits quietly if the port is
 * already bound — so this module's job is only: probe first, spawn only if nothing
 * answers, and never call `stop()` on a process this instance did not start (a window
 * that finds someone else's server already up must never kill it out from under them).
 *
 * vscode-free by design (mirrors claude-spotlight's split: lib/core.js has no `require
 * ("vscode")`, extension.js does): this file is required directly by extension.js and by
 * a scratch script for verification (see the work order's "start the server via
 * lib/server.js from a scratch node script and curl gallery.html 200").
 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const START_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 250;
const PROBE_TIMEOUT_MS = 1500;

/** GET http://127.0.0.1:<port>/gallery.html — resolves the status code, or null if nothing
 * answered (connection refused/reset/timed out). Never rejects. */
function probeGallery(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/gallery.html', timeout: PROBE_TIMEOUT_MS },
      (res) => {
        res.resume(); // drain — we only need the status
        resolve(res.statusCode);
      }
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.on('close', () => resolve(null)); // covers the destroy() above with no 'error'
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGallery(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if ((await probeGallery(port)) === 200) return true;
    await sleep(POLL_INTERVAL_MS);
  } while (Date.now() < deadline);
  return false;
}

/** Run `<python> <relArgs>` to completion (used for the one-shot gen_gallery.py call). */
function runOnce(python, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { cwd, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${python} ${args.join(' ')} exited ${signal ? `on ${signal}` : code}`));
    });
  });
}

class GalleryServer {
  /**
   * @param {object} opts
   * @param {string} opts.python  interpreter (sonora.python setting)
   * @param {number} opts.port    port (sonora.serverPort setting)
   * @param {string} opts.cwd     workspace folder containing _ds_manifest.json
   * @param {string} opts.logPath file docs/serve.py's stdio is appended to
   * @param {(msg: string) => void} [opts.log] progress messages for the caller's output channel
   */
  constructor({ python, port, cwd, logPath, log }) {
    this.python = python;
    this.port = port;
    this.cwd = cwd;
    this.logPath = logPath;
    this.log = log || (() => {});
    this.child = null; // set only when THIS instance spawned the process — see stop()
  }

  /**
   * Probe, and if nothing answers: check the two preconditions gen_gallery.py itself
   * needs (EXTENSION-PLAN.md §2 "What must stay true"), regenerate gallery.html if it
   * is merely stale/missing, then spawn serve.py and poll until it answers.
   * Resolves {started: boolean}; throws with a message fit for
   * vscode.window.showErrorMessage on either precondition failure or a timeout.
   */
  async ensureRunning() {
    if ((await probeGallery(this.port)) === 200) {
      this.log(`gallery already answering on :${this.port}`);
      return { started: false };
    }

    const vendorDir = path.join(this.cwd, '.claude-design-vendor');
    if (!fs.existsSync(vendorDir)) {
      // Named plainly, per the plan: the vendored Claude Design app CSS/JS is gitignored
      // and never fabricated by this extension — see EXTENSION-PLAN.md §2.
      throw new Error(
        `.claude-design-vendor/ is missing in ${this.cwd} — gen_gallery.py cannot run ` +
          'without it, and this extension will not fabricate it. Restore it (docs/design_pull.sh ' +
          'or however it was populated before) and try again.'
      );
    }

    const galleryHtml = path.join(this.cwd, 'gallery.html');
    if (!fs.existsSync(galleryHtml)) {
      this.log('gallery.html missing — running docs/gen_gallery.py once');
      await runOnce(this.python, [path.join('docs', 'gen_gallery.py')], this.cwd);
    }

    this.log(`starting docs/serve.py on :${this.port} (log: ${this.logPath})`);
    await this._spawnServe();

    const ok = await waitForGallery(this.port, START_TIMEOUT_MS);
    if (!ok) {
      throw new Error(
        `docs/serve.py did not answer on :${this.port} within ${START_TIMEOUT_MS}ms — see ${this.logPath}`
      );
    }
    return { started: true };
  }

  _spawnServe() {
    return new Promise((resolve, reject) => {
      let fd;
      try {
        fd = fs.openSync(this.logPath, 'a');
      } catch (e) {
        reject(e);
        return;
      }
      let child;
      try {
        // detached: true gives serve.py its own process group, so stop() below can signal
        // the whole thing (serve.py backgrounds a worker thread, not a child process, but
        // this stays correct if that ever changes) without also killing this extension host.
        child = spawn(this.python, [path.join('docs', 'serve.py')], {
          cwd: this.cwd,
          detached: true,
          stdio: ['ignore', fd, fd],
        });
      } catch (e) {
        fs.closeSync(fd);
        reject(e);
        return;
      }
      // The child has its own duped copy of the fd; closing ours here does not affect it.
      fs.closeSync(fd);
      child.on('error', reject);
      child.unref();
      this.child = child;
      resolve();
    });
  }

  /** Kill only a process THIS instance spawned. A server this window found already
   * running (e.g. the folder-open task, or another VS Code window) is left alone —
   * this extension never assumes ownership of a port it did not itself bind. */
  stop() {
    if (!this.child) return false;
    const pid = this.child.pid;
    try {
      process.kill(-pid, 'SIGTERM'); // negative pid == the detached process group
    } catch (e) {
      try {
        this.child.kill('SIGTERM');
      } catch (e2) {
        /* already gone */
      }
    }
    this.child = null;
    return true;
  }
}

module.exports = { GalleryServer, probeGallery, waitForGallery };

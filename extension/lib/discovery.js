'use strict';
/**
 * Sonora Design — vscode-free discovery-file helpers.
 *
 * Mirrors opesus-local.claude-spotlight-0.3.0/lib/core.js's discovery half exactly
 * (docs/EXTENSION-PLAN.md §2: "the exact shape of the extension already installed on
 * this machine ... package.json, extension.js, lib/, media/"; §4 "1.1" specifies the
 * fixed path below, so this file skips claude-spotlight's Windows/XDG branches — every
 * window that runs this extension is a Remote-WSL host on this one machine).
 *
 * extension.js requires this module and layers the vscode-facing bits (the webview
 * panel, commands, the loopback control server) on top, exactly as claude-spotlight
 * layers extension.js over lib/core.js.
 */
const fs = require('fs');
const path = require('path');

/** ~/.local/share/sonora-design, overridable for tests the same way claude-spotlight's
 * CLAUDE_SPOTLIGHT_DIR is (lib/core.js discoveryDir). */
function discoveryDir(env, homedir) {
  if (env.SONORA_DESIGN_DIR) return env.SONORA_DESIGN_DIR;
  return path.join(homedir, '.local', 'share', 'sonora-design');
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM'; // EPERM = alive but not ours; ESRCH = dead
  }
}

/**
 * Remove discovery files whose owning process is gone. The pid comes from the file
 * NAME, never its contents, so a window mid-rewrite of its own file never looks dead
 * to a window reading it concurrently (same reasoning as claude-spotlight's copy).
 */
function pruneStaleDiscoveryFiles(dir, selfPid) {
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    return;
  }
  for (const name of names) {
    const m = /^(\d+)\.json$/.exec(name);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid === selfPid || isPidAlive(pid)) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch (e) {
      /* ignore */
    }
  }
}

module.exports = { discoveryDir, isPidAlive, pruneStaleDiscoveryFiles };

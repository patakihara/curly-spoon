#!/usr/bin/env node
'use strict';
/**
 * Sonora Design — terminal control CLI.
 *
 * Finds the newest live discovery file this extension wrote and POSTs {tool, args}
 * to the VS Code window it names — "how the check in §4 and every later order gets
 * verified from a terminal" (docs/EXTENSION-PLAN.md §4 "1.1" deliverable 5).
 *
 * Usage:
 *   node extension/bin/sonora-ctl.js status
 *   node extension/bin/sonora-ctl.js openDesignSystem
 *   node extension/bin/sonora-ctl.js <tool> '<argsJson>'
 *
 * Run with ~/.local/share/node22/bin/node — node is not on this machine's
 * non-interactive PATH (docs/EXTENSION-PLAN.md §3).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { discoveryDir, isPidAlive } = require('../lib/discovery');

/** The live discovery file with the newest startedAt, or throws if none exists. */
function newestDiscoveryFile() {
  const dir = discoveryDir(process.env, os.homedir());
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch (e) {
    throw new Error(`no discovery dir at ${dir} — is Sonora Design active in a VS Code window?`);
  }
  const live = names
    .map((name) => /^(\d+)\.json$/.exec(name))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), file: path.join(dir, m[0]) }))
    .filter((c) => isPidAlive(c.pid));
  if (!live.length) throw new Error(`no live discovery file in ${dir}`);

  let newest = null;
  for (const c of live) {
    let info;
    try {
      info = JSON.parse(fs.readFileSync(c.file, 'utf8'));
    } catch (e) {
      continue; // mid-write or corrupt — skip, another candidate likely exists
    }
    if (!newest || new Date(info.startedAt) > new Date(newest.startedAt)) newest = info;
  }
  if (!newest) throw new Error(`every discovery file in ${dir} failed to parse`);
  return newest;
}

function post(info, tool, args) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ tool, args: args || {} });
    const req = http.request(
      {
        host: '127.0.0.1',
        port: info.port,
        method: 'POST',
        path: '/',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-sonora-token': info.token,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (e) {
            reject(new Error(`bad JSON reply: ${e.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const [tool, argsJson] = process.argv.slice(2);
  if (!tool) {
    console.error('usage: sonora-ctl.js <tool> [argsJson]');
    process.exitCode = 2;
    return;
  }
  let args;
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch (e) {
    console.error(`bad argsJson: ${e.message}`);
    process.exitCode = 2;
    return;
  }
  let info;
  try {
    info = newestDiscoveryFile();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }
  try {
    const reply = await post(info, tool, args);
    console.log(JSON.stringify(reply, null, 2));
  } catch (e) {
    console.error(`request failed: ${e.message}`);
    process.exitCode = 1;
  }
}

main();

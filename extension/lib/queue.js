'use strict';
/**
 * Sonora Design — vscode-free wrapper around `~/.claude/skills/queue`'s own CLI
 * (docs/EXTENSION-PLAN.md §4 "1.4"). The Feedback button's request is filed through
 * the queue rather than run headlessly, because a headless `claude -p` from this
 * machine's own hooks becomes a queue item anyway (§3's first fact) — `bin/queue add`
 * is the direct, honest version of that same trip, run as the user's own hand at HER
 * click (extension.js is what calls this module, never a session of this repo itself).
 *
 * buildPrompt is a byte-for-byte port of docs/serve.py::build_prompt's non-token-edit
 * branch (the only shape a gallery Feedback submit ever produces) — verified by
 * extension/test/check_build_prompt.mjs against docs/build_prompt_cli.py, the real
 * Python function, for three sample entries.
 *
 * vscode-free by design, like lib/server.js/lib/discovery.js: required directly by
 * extension.js and by the verification script above.
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const QUEUE_BIN = path.join(os.homedir(), '.claude', 'skills', 'queue', 'bin', 'queue');

/**
 * docs/serve.py::build_prompt's non-token-edit branch, reproduced exactly: the same
 * `Regenerate "<name>"` head, the same File/Element/Feedback body, the same trailing
 * paragraph. entry needs {name, path, text?, element?} — precisely the shape of a
 * gallery `sonora:feedback` message.
 */
function buildPrompt(entry) {
  const text = (entry.text || '').trim();
  const head = `Regenerate "${entry.name}"` + (text ? `: ${text}` : '.');
  const body = [`File: ${entry.path}`];
  if (entry.element) body.push(`Element: ${entry.element}`);
  if (text) body.push(`Feedback: ${text}`);
  return (
    `${head}\n\n` + body.join('\n') + '\n\n' +
    'This came from the Feedback button on the local design-system gallery, which mirrors ' +
    "Claude Design's own. Edit that card file in place to address the feedback, following " +
    "this repo's CLAUDE.md conventions (tokens only — no hardcoded colour, duration, easing " +
    'or icon size). Change only that file unless the feedback plainly asks otherwise.'
  );
}

/** Run `python3 QUEUE_BIN <args>` to completion, resolving {code, out, err}. Never
 * rejects on a nonzero exit — every caller below reads `code`/`err` itself, the same
 * way a shell caller would, since a refusal (quiet hours, no such id) is routine here,
 * not a bug. `env` lets `show` force glyph-free, deterministic output (see below). */
function run(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [QUEUE_BIN, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: env ? Object.assign({}, process.env, env) : process.env,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

// README "Using it": `queue add`'s own confirmation line, shared with the in-session
// gate (lib/render.py::when_clause) — "Filed as #<id>." / "Merged into #<id>
// (duplicate submission)." plus, when the quiet-hours pre-queue is holding it, "held
// until 06:00 (quiet hours)" folded into the same sentence.
const FILED_RE = /Filed as #([0-9a-f]+)\./;
const MERGED_RE = /Merged into #([0-9a-f]+)/;
const HELD_RE = /held until (\d{1,2}:\d{2}) \(quiet hours\)/i;

/**
 * `queue add <prompt>` with cwd = the workspace folder — the queue's own MCP/CLI
 * routes a submission to the instance selected by cwd (§3's third fact), which is
 * what lands this in the `sonora` instance rather than `main`. Resolves
 * {id, held}: `held` is the "HH:MM" quiet-hours release time when the CLI's own
 * verdict said so, else undefined — `add` itself is never refused outright (README
 * "Quiet hours": add "still files, just held until the window ends"), so a nonzero
 * exit here is a real error, not a routine hold.
 */
async function add(entry, cwd) {
  const prompt = buildPrompt(entry);
  const { code, out, err } = await run(['add', prompt], cwd);
  if (code !== 0) throw new Error(err.trim() || `queue add exited ${code}`);
  const filed = FILED_RE.exec(out) || MERGED_RE.exec(out);
  if (!filed) throw new Error(`queue add: could not find a filed id in: ${out.trim() || '(empty output)'}`);
  const held = HELD_RE.exec(out);
  return { id: filed[1], held: held ? held[1] : undefined };
}

// lib.queuelib.STATUSES, longest word first so `todo_answered` never matches as a
// bare `todo` prefix. `queue show`'s state line always starts "<id> <status-word>",
// whichever separator glyph-capability picked (see show() below).
const STATUS_WORDS = [
  'todo_answered', 'in_progress', 'awaiting_user', 'input_needed',
  'user_blocked', 'blocked', 'paused', 'failed', 'done', 'void', 'todo',
].map((s) => ({ status: s, word: s.replace(/_/g, ' ') }))
  .sort((a, b) => b.word.length - a.word.length);

/**
 * `queue show <id>` (read-only — never files anything). Resolves the entry's status
 * ('done'/'failed'/'in_progress'/... — lib.queuelib.STATUSES), or null when the CLI
 * refused outright, which `show` — unlike `add` — does during quiet hours (README
 * "Quiet hours"; bin/queue's own cmd_show). PYTHONIOENCODING=ascii forces
 * lib.render._use_glyphs() to false regardless of this host's own locale
 * (render.py's _encoding_supports_glyphs probes exactly that encoding), so the state
 * line is always plain "<id> | <status word> | ..." — deterministic to parse without
 * guessing at emoji byte widths.
 */
async function show(id, cwd) {
  const { code, out, err } = await run(['show', id], cwd, { PYTHONIOENCODING: 'ascii' });
  if (code !== 0) {
    if (/refused during quiet hours/.test(err)) return null;
    throw new Error(err.trim() || `queue show ${id} exited ${code}`);
  }
  const stateLine = out.split('\n').find((l) => l.startsWith(id + ' '));
  const field = stateLine ? stateLine.split(' | ')[1] : null;
  if (!field) throw new Error(`queue show ${id}: no state line found in: ${out.trim() || '(empty output)'}`);
  const hit = STATUS_WORDS.find((s) => field.startsWith(s.word));
  if (!hit) throw new Error(`queue show ${id}: unrecognized status "${field}"`);
  return hit.status;
}

/** .feedback/queue.jsonl helpers — the exact record shape and atomic-rename write
 * docs/serve.py::read_queue/write_queue/_feedback use, reproduced here only for the
 * `sonora.regenerate: "hold"` setting (§2 "Settings"): record locally, spawn nothing,
 * same as serve.py does when SONORA_FEEDBACK_CLAUDE=0. */
function feedbackQueuePath(repoRoot) {
  return path.join(repoRoot, '.feedback', 'queue.jsonl');
}

function readFeedbackQueue(repoRoot) {
  let text;
  try {
    text = fs.readFileSync(feedbackQueuePath(repoRoot), 'utf8');
  } catch (e) {
    return [];
  }
  const out = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch (e) {
      /* skip a corrupt line, same as read_queue's own except json.JSONDecodeError */
    }
  }
  return out;
}

function writeFeedbackQueue(repoRoot, entries) {
  const dir = path.join(repoRoot, '.feedback');
  fs.mkdirSync(dir, { recursive: true });
  const file = feedbackQueuePath(repoRoot);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, entries.map((e) => JSON.stringify(e) + '\n').join(''), 'utf8');
  fs.renameSync(tmp, file); // atomic, matching write_queue's own os.replace
}

/** Records `entry` in .feedback/queue.jsonl with status 'held', the same shape
 * docs/serve.py::_feedback writes for SONORA_FEEDBACK_CLAUDE=0. Resolves
 * {id, held: true} — always boolean here (no quiet-hours time attached; this is a
 * local, unconditional hold, not the queue's own soft-hold). */
function hold(entry, repoRoot) {
  const record = {
    id: crypto.randomBytes(6).toString('hex'), // 12 hex chars, matches uuid4().hex[:12]'s width
    ts: Date.now() / 1000,
    path: entry.path,
    name: String(entry.name || path.basename(entry.path)).slice(0, 200),
    text: String(entry.text || '').slice(0, 8000),
    element: entry.element ? String(entry.element).slice(0, 4000) : null,
    selector: entry.selector || null,
    status: 'held',
  };
  const entries = readFeedbackQueue(repoRoot);
  entries.push(record);
  writeFeedbackQueue(repoRoot, entries);
  return { id: record.id, held: true };
}

module.exports = { buildPrompt, add, show, hold };

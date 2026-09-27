#!/usr/bin/env python3
r"""Persistent local server for gallery.html (and anything else in this repo) — the same
UTF-8-charset fix docs/render_cards.mjs uses internally, kept running instead of spun up
and torn down per check, plus the small JSON API gallery.html's Feedback/Edit buttons and
element picker call (see "The API" below).

Plain `python3 -m http.server` serves .html with no charset, so Chromium falls back to
Latin-1 and every em dash/bullet in the reference cards renders as mojibake. Also required
now that gallery.html embeds live <iframe>s pointing at the card files themselves: those
pull CDN scripts with pinned SRI hashes, which fail under file:// origins the same way
webfonts do. Serving over HTTP is also what makes the element picker possible at all —
parent and iframe share an origin only here, never under file://.

Idempotent: if the port is already bound (another instance already running, e.g. from a
previous VS Code window), this exits quietly rather than erroring — safe to invoke on every
folder-open without accumulating duplicate servers.

Port 8888 always, and port 80 as well when the kernel allows an unprivileged bind there — that
second listener is what makes http://sonora.test/ work from inside WSL and not only from the
Windows side, which reaches it through a netsh portproxy instead (see serve_also_on).

Uses ThreadingHTTPServer, not plain HTTPServer: the latter handles one request at a time,
synchronously — fine for a bare curl, but a real browser (or a proxying layer in front of it,
e.g. a port-forwarder holding a persistent/keep-alive connection open) can get an empty or
dropped response while the single worker is busy with something else.

    python3 docs/serve.py            # foreground, Ctrl-C to stop
    python3 docs/serve.py &          # background

## The API

Three endpoints, all under /_api/ (a path no real repo file can collide with — the leading
underscore names no directory here, and _safe_rel would reject it anyway):

  POST /_api/open      {path, line?}                 -> opens the file in this VS Code window
  POST /_api/feedback  {path, name, text, element?}  -> queues it, and hands it to `claude -p`
  GET  /_api/feedback                                -> the queue, for status polling

Both POSTs act outside the browser — one drives the user's editor, the other starts an
edit-authorised agent in this repo — so they are gated on being same-origin JSON before they are
dispatched at all (see Handler._cross_site_reason), and `path` is not merely "somewhere under
ROOT" but "one of this design system's cards" (see _safe_rel). Neither check is theoretical: a
CORS-safelisted text/plain POST needs no preflight, so without the first, any page in any tab the
user has open could queue a run, and without the second, `.git/config` was a valid target for one.

This reproduces what the real Claude Design panel's own two buttons do, as closely as a local
mirror can. In the real app (verified by reading its ProjectPage chunk — see docs/gen_gallery.py
for how that capture is vendored):

  * `Edit` calls the project context's own openFile(card.editPath ?? card.path) — it opens
    the card's source in the app's editor pane. The local equivalent of "the editor you are
    already in" is this VS Code window, reached via the Remote-WSL `code` CLI (see open_file).

  * `Feedback` opens a collapse box, and Submit calls onSendFeedback(name, path, text, files),
    which is literally one line in the app:
        Te.current?.(`Regenerate "${name}"${text ? `: ${text}` : `.`}`,
                     [{id, name, path, content: text, type: `ds-feedback`}, ...files])
    i.e. it posts a chat message to the project's own Claude session asking it to regenerate
    that card, with the feedback attached. The local equivalent is a headless `claude -p` in
    this repo — same request, same repo, no chat pane needed. Element-scoped feedback carries
    the same three-line body the app builds for a comment attachment (P$ in that chunk):
        File: <path>\nElement: <descriptor>\nFeedback: <text>

Feedback runs edit files. That is the entire point of the button, but it means the button is
not a no-op you can click idly: every submission spawns a Claude that may rewrite the card.
Set SONORA_FEEDBACK_CLAUDE=0 to queue without spawning (the queue file still records
everything, so nothing is lost). Everything a run does lands in the working tree, so `git diff`
is the review surface and `git checkout --` the undo. A run that fails says why in both
.feedback/<id>.log and the queue entry's `error` — an empty log under a 'failed' entry used to be
the whole of the diagnostic, and it read identically whether claude had been found at all.

Runs are serial — one worker thread drains .feedback/queue.jsonl, so two Claudes never edit this
working tree at once — and a run that outlives RUN_TIMEOUT has its whole process group killed,
not just the `claude` process itself. An entry left reading 'queued' or 'running' by a server that
exited mid-run is reconciled to 'failed' on the next start (see reconcile_queue); without that it
would read as live forever, and gallery.html would poll for it and paint that card
'Regenerating…' on every future page load.
"""
import html
import http.server
import ipaddress
import json
import os
import queue
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import traceback
import uuid
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8888
ALT_PORT = 80   # see serve_also_on(); best-effort, never a precondition for PORT
MANIFEST = os.path.join(ROOT, '_ds_manifest.json')
FEEDBACK_DIR = os.path.join(ROOT, '.feedback')
QUEUE = os.path.join(FEEDBACK_DIR, 'queue.jsonl')
SPAWN_CLAUDE = os.environ.get('SONORA_FEEDBACK_CLAUDE', '1') != '0'
RUN_TIMEOUT = 1800

# Hostnames this server answers to on its /_api/ routes. Addresses are not listed and never need
# to be: the thing an allowlist defends against here is DNS rebinding — an attacker's domain
# re-pointed at this machine so their page loads as same-origin with us — and only a *name* can be
# rebound. 'sonora.test' is the Windows hosts entry the user actually browses (port 80, through a
# netsh portproxy onto this VM's eth0), so it arrives on a different port than everything else,
# which is why ports are ignored throughout — the port never carried any of the meaning here.
ALLOWED_HOSTNAMES = frozenset({'localhost', 'sonora.test'})

# Generous by an order of magnitude against the 8000/4000-character fields the handlers actually
# keep — this is a guard against a client that lies about (or omits) its length, not a size policy.
MAX_BODY = 64 * 1024

_queue_lock = threading.Lock()
_runs = queue.Queue()
_cards = {'mtime': None, 'files': frozenset()}
# Session-scoped memory for the edit panel's token-authored path: {session_id: [{token, property}]}.
# In-memory and never persisted — restarting the server (routine, see the module docstring) just
# starts a fresh notion of "this session", which is the right failure mode for a signal whose only
# job is telling build_token_prompt's sessionContext apart from a first-time edit; nothing about
# correctness depends on it surviving a restart. See Handler._edit_token.
_edit_sessions = {}


def card_files():
    """Every card in _ds_manifest.json, resolved — the closed set of files the API will act on.

    Re-read whenever the manifest's mtime moves rather than once at startup: this server is
    started on folder-open and then stays up for days, and having a newly added card be
    un-openable until someone restarts it would be a baffling failure for a stat per request.
    """
    try:
        mtime = os.path.getmtime(MANIFEST)
    except OSError:
        return frozenset()
    if _cards['mtime'] != mtime:
        try:
            with open(MANIFEST, encoding='utf-8') as f:
                cards = json.load(f).get('cards') or []
            files = frozenset(
                os.path.realpath(os.path.join(ROOT, c['path']))
                for c in cards if isinstance(c, dict) and isinstance(c.get('path'), str))
        except (OSError, ValueError, TypeError):
            files = frozenset()  # a half-written or malformed manifest closes the API, not opens it
        _cards['mtime'], _cards['files'] = mtime, files
    return _cards['files']


def _safe_rel(path):
    """Resolve a client-supplied path to one of this design system's cards, or return None.

    The client is our own gallery.html, which only ever sends a manifest card path, but this
    process listens on 0.0.0.0 (see main()) so every request body is untrusted. "Somewhere under
    ROOT" is not a tight enough test to hang the rest of this file on: a feedback run is a
    `claude -p` *told to edit the named file*, and `.git/config` is under ROOT — a core.fsmonitor
    or core.sshCommand written there is arbitrary command execution on the user's next git
    operation. So match against the set of files that are legitimate targets rather than trying to
    enumerate the ones that aren't; both sides of that comparison are realpaths, which is also what
    closes traversal (absolute paths, ../ chains, symlinks) and what makes this work at all if the
    repo itself sits under a symlinked path.

    realpath raises rather than returning falsy on an embedded NUL — the one string a caller can
    send that is not a path at all — and the caller wants a None here, not a dropped connection.
    """
    if not isinstance(path, str) or not path:
        return None
    try:
        full = os.path.realpath(os.path.join(ROOT, path))
    except (ValueError, OSError):
        return None
    if full not in card_files() or not os.path.isfile(full):
        return None
    return full


# --- ?srcmap=1: opt-in instrumentation proving the click-to-file:line round trip -------------
#
# See CLAUDE.md's "What we are building, and why it is possible": the real Claude Design preview
# harness requests cards with `?srcmap=1` and injects a Babel plugin that stamps every JSX element
# with `data-om-id="jsx:/Inline Babel script:<offset>:<line>:<col>"` — a position inside the
# *inline script's own content*, because that is all Babel ever sees. Their editor has no file
# behind that pseudo-name to write back to. We do: every card's inline `<script type="text/babel">`
# is a real file on disk, at a real, measurable line, so `file_line = baseline + babel_line` closes
# the loop they cannot close. This block reproduces their injection (same data-om-id shape, so a
# capture of their DOM and a capture of ours are the same format) and adds the one fact they have
# no use for: `data-om-baseline`, the file line the script tag sits on in the file being served.
#
# Measured across all 84 manifest cards (see the task's own investigation): 70 have exactly one
# inline `text/babel` script, 14 (the flat-color/type/spacing guideline cards, plus
# reference/index.card.html) have none — plain HTML with no JSX to instrument at all. None has
# more than one. _BABEL_TAG_RE.search takes the first match, which is therefore also the only
# match on every card that has one; a card that ever grew a second inline babel script would have
# it served un-instrumented and un-remarked-on, which is why that count is asserted in
# .probe/srcmap_roundtrip.mjs rather than just assumed.
_BABEL_TAG_RE = re.compile(r'<script\b[^>]*\btype=["\']text/babel["\'][^>]*>', re.IGNORECASE)

_SRCMAP_PLUGIN_BODY = '''/* Injected only for ?srcmap=1 (see docs/serve.py: srcmap_inject). Registers a Babel plugin
   that stamps every JSX element with its position *inside this inline script's own text* — the
   same jsx:/Inline Babel script:<offset>:<line>:<col> shape the real Claude Design editor's own
   preview harness uses, so a captured data-om-id from either one parses the same way. Turning
   that position into a real file:line is deliberately NOT done here: it needs a fact about the
   file on disk (which line the <script type="text/babel"> tag itself sits on) that only the
   server can supply without re-deriving it in the browser, so it travels as this script tag's
   own data-om-baseline attribute instead — see the module comment above _BABEL_TAG_RE. */
Babel.registerPlugin('omid', function (babel) {
  var t = babel.types;
  return {
    visitor: {
      JSXOpeningElement: function (path) {
        var loc = path.node.loc;
        if (!loc) return;  // synthetic nodes Babel itself inserts carry no loc; nothing to stamp
        // <React.Fragment>/<> elements render no DOM node at all, so a data-om-id here has
        // nowhere to land -- except React actually forwards unknown props straight onto
        // Fragment and warns loudly ("Invalid prop `data-om-id` supplied to `React.Fragment`").
        // Measured on this corpus: 45 of 70 cards hit this today (19 of them in
        // ui_kits/mobile/index.html alone). Explicit <React.Fragment> is caught by name; the
        // <>...</> shorthand parses as JSXFragment, which never reaches JSXOpeningElement at
        // all, so it needs no guard here.
        var name = path.node.name;
        var isFragment = (name.type === 'JSXIdentifier' && name.name === 'React.Fragment') ||
          (name.type === 'JSXMemberExpression' && name.object.name === 'React' && name.property.name === 'Fragment');
        if (isFragment) return;
        var id = 'jsx:/Inline Babel script:' + path.node.start + ':' + loc.start.line + ':' + (loc.start.column + 1);
        // Pushed last, after any {...spread}: JSX attribute order is last-wins (it compiles to
        // an Object.assign-like merge), so this always wins over a spread that happened to carry
        // its own data-om-id, and never fights a literal one authored in the card's own JSX.
        path.node.attributes.push(t.jsxAttribute(t.jsxIdentifier('data-om-id'), t.stringLiteral(id)));
      }
    }
  };
});
'''


def srcmap_inject(html_text, rel_path):
    """Return (new_html, baseline_line) with the omid plugin wired in, or (None, None) if
    `html_text` has no inline `<script type="text/babel">` to instrument at all.

    baseline_line is the 1-based line the babel tag's own OPENING `<script ...>` sits on in
    `html_text` as given (before this function inserts anything). The formula to recover a real
    file line from a Babel loc is `file_line = baseline_line + babel_line - 1`, NOT `baseline_line
    + babel_line` — verified by hand against 5+ cards and initially gotten wrong in exactly the
    way that off-by-one invites: `textContent` of the script tag includes the newline that ends
    the tag's own line, so Babel's line 1 is the (empty) tail of the tag's OWN line, not the
    first line of content. Content's first line is therefore Babel line 2, which is
    baseline_line + 2 - 1 = baseline_line + 1 — matching "content starts at the line after the
    tag" while still falling out of one uniform formula. Holds for every one of the 70 cards
    that has an inline babel script: none has anything trailing the `>` on the tag's own line
    (checked separately), which is the one thing that would perturb line 1's meaning.
    """
    m = _BABEL_TAG_RE.search(html_text)
    if not m:
        return None, None
    baseline_line = html_text.count('\n', 0, m.start()) + 1
    tag = m.group(0)
    # tag always ends in '>' (the regex requires it); splice the plugin wiring in just before it
    # rather than trying to merge into any type="..." the tag already carries.
    new_tag = tag if 'data-plugins' in tag else tag[:-1] + ' data-plugins="omid">'
    plugin_script = (
        '<script data-omelette-injected="" data-om-baseline="%d" data-om-file="%s">\n%s</script>\n'
        % (baseline_line, html.escape(rel_path, quote=True), _SRCMAP_PLUGIN_BODY)
    )
    return html_text[:m.start()] + plugin_script + new_tag + html_text[m.end():], baseline_line


def _hostname_ok(host):
    """See ALLOWED_HOSTNAMES: names are allowlisted, addresses are inherently fine."""
    if not host:
        return False
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return host.lower() in ALLOWED_HOSTNAMES


def _live_vscode_socket():
    """Find a VS Code CLI socket that something is actually listening on.

    The Remote-WSL `code` shim talks to its window over $VSCODE_IPC_HOOK_CLI, a unix socket under
    $XDG_RUNTIME_DIR. Inheriting that variable is not enough here for two reasons, both of which
    happen routinely:

      * This server outlives windows. It is started once per folder-open and then exits quietly on
        every later start because the port is already bound (see already_running) — so after the
        user closes VS Code and opens it again, the still-running server is holding the *old*
        window's hook while the new window listens on a new one.
      * Whatever shell started it may itself have carried a stale hook in.

    A dead window leaves its socket file behind, so file existence proves nothing; connect() does.
    Sockets are tried newest first, preferring the inherited hook if it is still live.
    """
    import glob
    runtime = os.environ.get('XDG_RUNTIME_DIR') or f'/run/user/{os.getuid()}'
    candidates = sorted(glob.glob(os.path.join(runtime, 'vscode-ipc-*.sock')),
                        key=lambda p: os.stat(p).st_mtime, reverse=True)
    inherited = os.environ.get('VSCODE_IPC_HOOK_CLI')
    if inherited in candidates:
        candidates.remove(inherited)
        candidates.insert(0, inherited)
    for sock in candidates:
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as s:
                s.settimeout(0.4)
                s.connect(sock)
            return sock
        except OSError:
            continue  # stale file from a closed window
    return None


def open_file(path, line=None):
    r"""Open a repo file in the VS Code window this repo is open in.

    `code` here is the Remote-WSL server's own remote-cli shim (~/.vscode-server/bin/<hash>/bin/
    remote-cli/code), which talks over a socket to the already-running window — so this reuses
    the user's existing window rather than launching anything.

    Deliberately not a `vscode://file/...` link on the button instead, which would need no server
    at all: the browser showing gallery.html is Windows-side (VS Code's Simple Browser is an
    Electron webview, and an external browser is Windows-side by definition), so a vscode:// URI
    from there resolves its path against Windows, not this filesystem — /home/sofiapata/... would
    have to become \\wsl.localhost\Ubuntu-25.04\home\... and would open a *second*, non-remote
    window on the UNC path. Going through the server keeps the path in the filesystem that owns it.
    """
    target = f'{path}:{line}' if line else path
    env = dict(os.environ)
    sock = _live_vscode_socket()
    if not sock:
        return False, 'no VS Code window is listening — is this repo open in a Remote-WSL window?'
    env['VSCODE_IPC_HOOK_CLI'] = sock
    try:
        subprocess.run(['code', '-g' if line else '-r', target], cwd=ROOT, env=env,
                       capture_output=True, timeout=15, check=True)
        return True, None
    except FileNotFoundError:
        return False, 'the `code` CLI is not on PATH — is this VS Code window a Remote-WSL one?'
    except subprocess.CalledProcessError as e:
        return False, (e.stderr or b'').decode('utf-8', 'replace').strip() or 'code exited nonzero'
    except subprocess.TimeoutExpired:
        return False, '`code` timed out'


def read_queue():
    if not os.path.exists(QUEUE):
        return []
    out = []
    with open(QUEUE, encoding='utf-8') as f:
        for ln in f:
            ln = ln.strip()
            if ln:
                try:
                    out.append(json.loads(ln))
                except json.JSONDecodeError:
                    pass
    return out


def write_queue(entries):
    os.makedirs(FEEDBACK_DIR, exist_ok=True)
    tmp = QUEUE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    os.replace(tmp, QUEUE)  # atomic: a poll landing mid-write never sees a truncated queue


def update_entry(entry_id, **fields):
    with _queue_lock:
        entries = read_queue()
        for e in entries:
            if e['id'] == entry_id:
                e.update(fields)
        write_queue(entries)


def build_prompt(entry):
    """The same request the real app sends, in the same words — or, for a token-authored
    property edit (entry['kind'] == 'token-edit'), the change-record prompt from
    .probe/writeback-design.md. Both are headless `claude -p` requests against this same queue
    and worker, so they share one dispatch point rather than the caller picking between two
    run functions.

    See the module docstring: the app's own onSendFeedback builds `Regenerate "<name>": <text>`
    plus a ds-feedback attachment, and its element-comment path builds the File/Element/Feedback
    three-liner. A headless run has no attachment channel, so both are inlined into the prompt.
    """
    if entry.get('kind') == 'token-edit':
        return build_token_prompt(entry)
    text = (entry.get('text') or '').strip()
    head = f'Regenerate "{entry["name"]}"' + (f': {text}' if text else '.')
    body = [f'File: {entry["path"]}']
    if entry.get('element'):
        body.append(f'Element: {entry["element"]}')
    if text:
        body.append(f'Feedback: {text}')
    return (
        f'{head}\n\n' + '\n'.join(body) + '\n\n'
        'This came from the Feedback button on the local design-system gallery, which mirrors '
        "Claude Design's own. Edit that card file in place to address the feedback, following "
        "this repo's CLAUDE.md conventions (tokens only — no hardcoded colour, duration, easing "
        'or icon size). Change only that file unless the feedback plainly asks otherwise.'
    )


# --- token-authored property edits: the "ask an agent, never guess" half of the writeback ------
#
# See CLAUDE.md's "Writeback policy": an edit to a property whose authored value was a literal
# writes back directly (docs/edit_writeback.mjs, called from _edit_apply below); an edit to a
# `var(--token)`-authored property does NOT get silently resolved to a literal or silently
# rewrite tokens/*.css. It becomes a change record — the facts an agent needs to tell "retarget
# this element" from "redefine the token" from "this needed a new token" from "the token layer
# genuinely can't carry this" apart — handed to the same `claude -p` pipeline the Feedback button
# already runs, with a prompt modeled on .probe/writeback-design.md §4.
_TOKEN_DECL_RE_CACHE = {}


def _token_decl_re(token):
    """`--foo` -> a regex matching its declaration line in a tokens/*.css file. Cached because a
    Save can touch the same token from several elements in one batch."""
    rx = _TOKEN_DECL_RE_CACHE.get(token)
    if rx is None:
        rx = re.compile(re.escape(token) + r'\s*:\s*([^;]+);')
        _TOKEN_DECL_RE_CACHE[token] = rx
    return rx


def _tokens_dir_files():
    d = os.path.join(ROOT, 'tokens')
    try:
        return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith('.css')]
    except OSError:
        return []


def token_usage_breadth(token):
    """How many files under this design system reference `var(<token>)` at all, and how many
    times `token` is itself *declared* (a token can carry different values per theme block, e.g.
    --surface-card has three declarations in tokens/colors.css for light/dark/etc — see
    token_definition below). Breadth is the signal the writeback policy names explicitly
    (--spacing-sm in 76 files vs --weight-medium in 6): cheap to compute exactly with a grep-
    equivalent walk rather than guess at, and cheap enough to redo per edit rather than cache.
    """
    needle = f'var({token})'.encode('utf-8')
    decl_needle = token.encode('utf-8') + b':'
    files = 0
    declarations = 0
    for base in ('tokens', 'components', 'guidelines', 'reference', 'ui_kits'):
        for dirpath, _dirnames, filenames in os.walk(os.path.join(ROOT, base)):
            for fn in filenames:
                if not (fn.endswith('.css') or fn.endswith('.html') or fn.endswith('.jsx')):
                    continue
                full = os.path.join(dirpath, fn)
                try:
                    with open(full, 'rb') as f:
                        data = f.read()
                except OSError:
                    continue
                if needle in data:
                    files += 1
                if fn.endswith('.css'):
                    declarations += data.count(decl_needle)
    return files, declarations


def token_definition(token):
    """Where `token` is declared and what it currently resolves to — the first tokens/*.css hit,
    plus every distinct value found (a token can differ per theme selector block). Best-effort:
    this is a regex over the token files, not a CSS parser, which is enough for the flat
    `--name:value;` custom-property declarations this project's tokens/*.css files use
    exclusively (confirmed by reading them — no nesting, no calc(), no multi-token shorthand
    lines to mis-split on).
    """
    for path in _tokens_dir_files():
        try:
            with open(path, encoding='utf-8') as f:
                text = f.read()
        except OSError:
            continue
        rx = _token_decl_re(token)
        matches = list(rx.finditer(text))
        if not matches:
            continue
        first_line = text.count('\n', 0, matches[0].start()) + 1
        values = sorted({m.group(1).strip() for m in matches})
        return {'file': os.path.relpath(path, ROOT), 'line': first_line, 'values': values}
    return None


def matches_existing_token(resolved_value):
    """Reverse lookup: does some *other* token already carry this exact resolved value? The
    strongest single signal the writeback policy calls out for "retarget" over every other
    option — computed eagerly here rather than left for the prompt to guess at from raw text.
    Exact string match only (post-strip): good enough for hex colors and px/rem lengths, which
    is everything these six properties' values ever are; no color-space normalization attempted.
    """
    if not resolved_value:
        return None
    needle = str(resolved_value).strip().lower()
    hits = []
    for path in _tokens_dir_files():
        try:
            with open(path, encoding='utf-8') as f:
                text = f.read()
        except OSError:
            continue
        for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;]+);', text):
            if m.group(2).strip().lower() == needle:
                hits.append(m.group(1))
    return hits[0] if len(hits) == 1 else (hits or None)


def build_token_prompt(entry):
    """The five-option decision prompt from .probe/writeback-design.md §4, filled from
    entry['record'] (the change record _edit_token built — see Handler._edit_token). Kept as a
    literal instruction not to guess: 'ask' is a real, expected outcome, not a failure mode, and
    the prompt says so explicitly so a middling-confidence record doesn't get forced into a
    decision it doesn't support.
    """
    r = entry['record']
    record_json = json.dumps(r, indent=2, ensure_ascii=False)
    return (
        "You are deciding how to apply a visual edit made in the Sonora Design System's element "
        "editor. The editor changed a resolved CSS value; the source property is authored as a "
        "design token, not a literal, so the edit could mean several different things. Decide "
        "which, and act accordingly — or ask, if it is genuinely ambiguous.\n\n"
        f"CHANGE RECORD:\n{record_json}\n\n"
        "WHAT EACH OPTION MEANS, CONCRETELY:\n"
        "1. RETARGET — swap this element's authored var() for a different existing token whose "
        "current value already equals (or is very close to) the new resolved value. Only this "
        "element's authored token reference changes; tokens/*.css is untouched. Prefer this when "
        "matchesExistingToken is non-null, or when the token is used narrowly enough that "
        "changing its definition would clearly be too broad.\n"
        "2. REDEFINE — change what the token itself resolves to, in tokens/*.css. This ripples "
        "to every one of tokenUsage.totalFilesUsingToken usages. Prefer this when the token is "
        "already narrowly scoped to this kind of use AND sameEditRepeatedOnOtherElements shows "
        "the same push happening elsewhere in this session.\n"
        "3. ADD A NEW TOKEN — the new value doesn't match anything in the existing scale and "
        "doesn't belong under the old token's name either. Name it consistently with "
        "tokens/*.css's existing naming convention, add it there, and retarget only this "
        "element to it.\n"
        "4. LITERAL OVERRIDE — the token layer genuinely cannot carry this (a true one-off). "
        "Write the resolved value directly in the card file, same as an ordinary literal edit, "
        "but leave a comment noting it was authored as a token before this override.\n"
        "5. ASK — the record does not clearly support any of the above. State the two most "
        "plausible options and the specific fact that would resolve it, and stop — do not guess. "
        "If you choose this, do not edit any file.\n\n"
        "Apply your decision directly (edit the file(s) yourself) unless you chose ASK. Follow "
        "this repo's CLAUDE.md conventions. Change only what the decision requires — for RETARGET "
        f"or LITERAL OVERRIDE that is only {r.get('file', 'the card file')}; for REDEFINE or ADD A "
        "NEW TOKEN it also includes the relevant tokens/*.css file, and per CLAUDE.md, "
        "regenerating export/ in the same turn if you touch tokens/*.css."
    )


def kill_tree(p):
    """SIGTERM the child's whole process group, then SIGKILL whatever is still standing.

    `claude` is a node process that spawns tool subprocesses and shells of its own, so killing
    only the process we started leaves those orphans editing files in this repo — after the entry
    has been marked failed, which is precisely when the user reaches for `git checkout --` and
    starts fighting a writer they can't see. start_new_session in run_claude is what makes the
    child its own group leader, so its pid is the group id.
    """
    for sig in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(p.pid, sig)
        except (ProcessLookupError, PermissionError):
            break
        try:
            return p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            continue
    try:
        return p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        return None


def claude_binary():
    """Absolute path to the `claude` CLI, or None if it cannot be found.

    Not the bare name in the argv: this server is normally started by the VS Code folder-open
    task, so its environment is whatever login shell the Remote-WSL server itself inherited — and
    that PATH does not include ~/.local/bin, where the installer puts claude. `claude` therefore
    raised FileNotFoundError before it ever ran, and every submitted run went straight to 'failed'
    with a log holding nothing but the prompt. which() is still asked first so a claude installed
    anywhere else (nvm, /usr/local/bin, a shim) keeps winning; the literal path below is only the
    installer's documented default, checked for executability rather than assumed.
    """
    found = shutil.which('claude')
    if found:
        return found
    fallback = os.path.expanduser('~/.local/bin/claude')
    return fallback if os.access(fallback, os.X_OK) else None


def node_binary():
    """Absolute path to a `node` that can run docs/edit_writeback.mjs, or None.

    Same reasoning as claude_binary(): this process's PATH is whatever the VS Code folder-open
    task's login shell handed it, which on this machine does not include the corepack shim
    directory node itself lives in. which() still goes first so any node on PATH wins; the
    literal fallback is this machine's actual install, found once by hand (see CLAUDE.md's
    operational notes — "node ... may not be on your PATH").
    """
    found = shutil.which('node')
    if found:
        return found
    fallback = '/home/sofiapata/.local/share/node22/bin/node'
    return fallback if os.access(fallback, os.X_OK) else None


_WRITEBACK_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'edit_writeback.mjs')


def run_writeback(payload):
    """Shell out to docs/edit_writeback.mjs — see its own module comment for the protocol and
    why this is a subprocess rather than a Python re-implementation (no JS/JSX parser in the
    standard library, and six properties don't warrant writing one).

    Always returns a dict with an 'ok' key: a node that can't be found, a script that throws, a
    timeout, or output that isn't JSON all come back as {'ok': False, 'reason': ...} rather than
    raising, because every caller here is a request handler that has to answer *something* to the
    browser regardless of which of those happened.
    """
    exe = node_binary()
    if not exe:
        return {'ok': False, 'reason': 'node-not-found',
                'message': 'no `node` on this process\'s PATH or at the known fallback location'}
    try:
        p = subprocess.run(
            [exe, _WRITEBACK_SCRIPT], input=json.dumps(payload), capture_output=True,
            text=True, timeout=15, cwd=ROOT)
    except subprocess.TimeoutExpired:
        return {'ok': False, 'reason': 'writeback-timeout'}
    except OSError as e:
        return {'ok': False, 'reason': 'exception', 'message': str(e)}
    try:
        return json.loads(p.stdout)
    except ValueError:
        return {'ok': False, 'reason': 'bad-writeback-output',
                'message': (p.stderr or p.stdout or '')[-2000:]}


def fail_run(entry, log_path, reason):
    """Mark an entry failed and say why in both places the user might look.

    The entry carries the reason for the UI, but gallery.js's failure toast points at the log
    file, and a run that failed before `claude` produced a byte leaves a log holding only the
    prompt — indistinguishable from a Claude that ran fine and decided to change nothing. So the
    reason goes into the log too, after whatever output there is.
    """
    try:
        with open(log_path, 'a', encoding='utf-8') as log:
            log.write(f'\n*** run failed: {reason}\n')
    except OSError:
        pass  # the log being unwritable is itself a plausible reason we are here
    update_entry(entry['id'], status='failed', error=reason, finished=time.time())


def run_claude(entry):
    log_path = os.path.join(FEEDBACK_DIR, entry['id'] + '.log')
    update_entry(entry['id'], status='running', log=os.path.relpath(log_path, ROOT))
    try:
        exe = claude_binary()
        if not exe:
            return fail_run(entry, log_path, 'the `claude` CLI is not on this process\'s PATH '
                                             'and is not at ~/.local/bin/claude')
        with open(log_path, 'w', encoding='utf-8') as log:
            log.write(f'# {exe} -p <the prompt below> --permission-mode acceptEdits\n\n')
            log.write(build_prompt(entry) + '\n\n' + '=' * 60 + '\n\n')
            log.flush()
            p = subprocess.Popen(
                [exe, '-p', build_prompt(entry), '--permission-mode', 'acceptEdits'],
                # stdin closed rather than inherited: `claude -p` waits on stdin for piped input
                # before it starts (the run's own log says so), and an inherited one is either the
                # terminal this server was launched from — where the child would then be competing
                # for the user's keystrokes — or a pipe that never closes.
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True)
            try:
                rc = p.wait(timeout=RUN_TIMEOUT)
            except subprocess.TimeoutExpired:
                kill_tree(p)
                return fail_run(entry, log_path,
                                f'still running after {RUN_TIMEOUT}s — process group killed')
        if rc != 0:
            return fail_run(entry, log_path, f'`claude` exited {rc}')
        update_entry(entry['id'], status='done', finished=time.time())
    except Exception as e:  # noqa: BLE001 - a failed run must not take the server down with it
        fail_run(entry, log_path, f'{type(e).__name__}: {e}')


def run_worker():
    """Drains the queue one entry at a time — which is what the UI has been calling it all along.

    It used to be a thread per request, which meant a loop of POSTs was a fork bomb: N submissions
    became N simultaneous acceptEdits Claudes in one working tree, racing each other's writes to
    the same card, or to the same tokens/*.css that several cards read. Serial also makes 'queued'
    a state an entry can actually be observed in rather than a label it passes through instantly.
    """
    while True:
        entry = _runs.get()
        try:
            run_claude(entry)
        except Exception:  # noqa: BLE001 - run_claude settles its own entry; reaching here means
            # even that failed, and an entry left reading 'running' by a server that is still up is
            # the one stall reconcile_queue cannot clear — it only ever runs at startup. So settle
            # it here too, and keep the traceback, because getting here at all is a bug.
            traceback.print_exc()
            try:
                update_entry(entry['id'], status='failed', finished=time.time(),
                             error='the run worker itself failed — see the server output')
            except Exception:  # noqa: BLE001
                traceback.print_exc()
        finally:
            _runs.task_done()


def reconcile_queue():
    """Fail forward any entry the last server exited in the middle of, and say how many.

    Run threads are daemons and the queue is a plain file, so any exit — Ctrl-C, a closed VS Code
    window, a reboot — kills a run mid-flight without touching its entry, which then reads
    'queued' or 'running' forever. That is not cosmetic: gallery.js polls for as long as any entry
    is live and re-adopts live entries on load, so one orphan makes every future page view poll
    this endpoint forever and paint that card 'Regenerating…', with nothing in the UI to clear it.
    Reaching here means main() found the port free, which is proof the process that owned those
    entries is gone.
    """
    with _queue_lock:
        entries = read_queue()
        stale = [e for e in entries if e.get('status') in ('queued', 'running')]
        for e in stale:
            e['status'] = 'failed'
            e['error'] = 'the server exited while this run was in flight'
            e['finished'] = time.time()
        if stale:
            write_queue(entries)
    return len(stale)


class Handler(http.server.SimpleHTTPRequestHandler):
    # BaseHTTPRequestHandler applies this to the connection socket, which is the only thing
    # standing between a client that opens a connection and then says nothing and a worker thread
    # parked in rfile.read() for the life of the process. ThreadingHTTPServer is one thread per
    # connection, so unbounded parking is a slow FD/thread leak rather than an instant denial —
    # which is exactly the kind of thing nobody notices until the server has been up for a week.
    timeout = 10

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
    }

    def log_message(self, *args):
        pass  # quiet — this runs unattended in the background

    def _json(self, code, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        # The gallery is same-origin with this server, so no CORS header is needed or wanted.
        # Cache-Control does matter: the feedback poll is a plain GET, and a cached 200 would
        # freeze every card's status chip at whatever it read first.
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlsplit(self.path)
        route = parsed.path
        if route == '/_api/feedback':
            return self._json(200, {'entries': read_queue(), 'claude': SPAWN_CLAUDE})
        if route.endswith('.html') and parse_qs(parsed.query).get('srcmap') == ['1']:
            # Bytes served WITHOUT this param must be exactly what SimpleHTTPRequestHandler would
            # have sent — that is the whole opt-in premise (CLAUDE.md: "pixel fidelity at rest").
            # _serve_srcmap only ever returns True after it has already written a full response;
            # False means "fall through", not "error" — a non-card path, an unreadable file, or a
            # card with no inline babel script to instrument (see srcmap_inject) all land here and
            # are served exactly as they would be with no query string at all.
            if self._serve_srcmap(route):
                return
        if route == '/':
            # The repo root has no index.html, so the default handler answers `/` with a directory
            # listing — which is what you get for typing the bare hostname (http://sonora.test/),
            # the shortest and therefore most-typed form of the URL. Redirect instead: the gallery
            # is the only reason this server exists. 302, not 301, because a permanent redirect
            # would be cached by the browser and survive any later decision to put something else
            # at the root, with no way to clear it short of the user wiping site data.
            self.send_response(302)
            self.send_header('Location', '/gallery.html')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        return super().do_GET()

    def _serve_srcmap(self, route):
        """Serve `route` (a path, no query string) with the omid plugin wired in. True on
        success, False to mean "fall through to the normal static handler" — see the call site.

        Reuses _safe_rel's manifest-membership check rather than trusting the path is safe just
        because it ends in .html: this is a GET with no origin check (unlike the /_api/ POSTs),
        so it has to be safe for literally any page on the internet to request, and the answer is
        the same one _safe_rel already gives for the same reason (see its docstring).
        """
        full = _safe_rel(unquote(route.lstrip('/')))
        if not full:
            return False
        try:
            with open(full, encoding='utf-8') as f:
                text = f.read()
        except OSError:
            return False
        new_html, _baseline = srcmap_inject(text, os.path.relpath(full, ROOT))
        if new_html is None:
            return False  # no inline babel script in this card — nothing for ?srcmap=1 to do
        body = new_html.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        # This response's bytes depend on a query param the browser's HTTP cache does not
        # reliably key on (and never should be trusted to) — no-store, not merely no-cache.
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
        return True

    def _cross_site_reason(self):
        """Why this request must not be dispatched, or None.

        Both /_api/ POSTs have effects outside the browser: one drives the user's editor, the
        other starts `claude -p ... --permission-mode acceptEdits` in this repo with a prompt built
        from the request body. An attacking page does not need to read the response — the side
        effect *is* the payload — and a text/plain POST is a CORS-"simple" request, so the browser
        sends it with no preflight and no chance for us to refuse. Unchecked, any page in any tab
        the user happens to have open could drive an edit-authorised agent through here.

        Three layers, cheapest first:
          * Content-Type must be JSON, which is not CORS-simple — so a cross-origin POST has to
            preflight, and this server answers OPTIONS with 501. That alone ends the drive-by.
          * Sec-Fetch-Site is set by the browser and cannot be forged by page script, so when it
            is present at all it must say same-origin.
          * Origin and Host must each name something this server is legitimately reached as
            (see ALLOWED_HOSTNAMES), which is what closes DNS rebinding.

        None of this constrains a non-browser client that can already route to the port, and
        nothing header-based could — a token baked into gallery.html wouldn't either, since anything
        that can reach the port can also just GET gallery.html and read it. What limits *that*
        exposure is the blast radius: _safe_rel accepts only card files, run_worker runs one at a
        time, and everything a run does lands in the working tree where `git diff` shows it.
        """
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return 'expected Content-Type: application/json'
        site = self.headers.get('Sec-Fetch-Site')
        if site and site != 'same-origin':
            return 'cross-site request refused'
        origin = self.headers.get('Origin')
        if origin and not _hostname_ok(urlsplit(origin).hostname):
            return 'cross-origin request refused'
        if not _hostname_ok(urlsplit('//' + (self.headers.get('Host') or '')).hostname):
            return 'unrecognised Host'
        return None

    def do_POST(self):
        route = self.path.split('?')[0]
        if not route.startswith('/_api/'):
            return self.send_error(405)
        why = self._cross_site_reason()
        if why:
            return self._json(403, {'error': why})
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            n = -1
        if n < 0 or n > MAX_BODY:
            # Refusing rather than clamping: read(-1) reads to EOF, and an overstated length parks
            # this thread in rfile.read() until the client goes away or `timeout` above fires,
            # buffering whatever does arrive in one growing allocation meanwhile.
            return self._json(413, {'error': 'missing or unreasonable Content-Length'})
        try:
            data = json.loads(self.rfile.read(n) or b'{}')
        except ValueError:
            return self._json(400, {'error': 'expected a JSON body'})
        if not isinstance(data, dict):
            return self._json(400, {'error': 'expected a JSON object'})
        try:
            if route == '/_api/open':
                return self._open(data)
            if route == '/_api/feedback':
                return self._feedback(data)
            if route == '/_api/edit/resolve':
                return self._edit_resolve(data)
            if route == '/_api/edit/apply':
                return self._edit_apply(data)
            if route == '/_api/edit/token':
                return self._edit_token(data)
        except Exception as e:  # noqa: BLE001 - see below
            # A handler that raises answers with a dropped connection, which from the browser's
            # side is indistinguishable from the server being down — the gallery would report
            # "is docs/serve.py running?" about a server that is running fine. Anything landing
            # here is a bug, so keep the traceback and still answer.
            traceback.print_exc()
            return self._json(500, {'error': f'{type(e).__name__}: {e}'})
        return self.send_error(404)

    def _open(self, data):
        full = _safe_rel(data.get('path'))
        if not full:
            return self._json(400, {'error': 'not a card in this design system'})
        line = data.get('line')
        ok, err = open_file(full, line if isinstance(line, int) and line > 0 else None)
        return self._json(200 if ok else 500, {'ok': ok, 'error': err})

    def _feedback(self, data):
        full = _safe_rel(data.get('path'))
        if not full:
            return self._json(400, {'error': 'not a card in this design system'})
        text = str(data.get('text') or '').strip()
        element = str(data.get('element') or '').strip() or None
        if not text and not element:
            return self._json(400, {'error': 'empty feedback'})
        entry = {
            'id': uuid.uuid4().hex[:12],
            'ts': time.time(),
            'path': os.path.relpath(full, ROOT),
            'name': str(data.get('name') or os.path.basename(full))[:200],
            'text': text[:8000],
            'element': element[:4000] if element else None,
            'selector': str(data.get('selector') or '')[:1000] or None,
            'status': 'queued' if SPAWN_CLAUDE else 'held',
        }
        with _queue_lock:
            entries = read_queue()
            entries.append(entry)
            write_queue(entries)
        if SPAWN_CLAUDE:
            _runs.put(entry)  # picked up by the single worker in main(), in submission order
        return self._json(200, {'ok': True, 'entry': entry})

    # --- the visual editor's writeback endpoints ---------------------------------------------
    #
    # Two-step by design, matching the writeback policy in CLAUDE.md: /resolve is a pure read (no
    # file is touched) that the panel calls right before Save to find out whether the property it
    # is about to write is a literal (safe to splice directly) or a `var(--token)` (routed to
    # /token instead, never silently rewritten). /apply only ever runs on a property /resolve (or
    # the panel's own record of it) already confirmed literal-authored.

    def _edit_resolve(self, data):
        full = _safe_rel(data.get('path'))
        if not full:
            return self._json(400, {'error': 'not a card in this design system'})
        offset = data.get('charOffset')
        prop = str(data.get('property') or '')
        if not isinstance(offset, int) or not prop:
            return self._json(400, {'error': 'missing charOffset/property'})
        return self._json(200, run_writeback({'op': 'resolve', 'file': full, 'charOffset': offset, 'property': prop}))

    def _edit_apply(self, data):
        full = _safe_rel(data.get('path'))
        if not full:
            return self._json(400, {'error': 'not a card in this design system'})
        offset = data.get('charOffset')
        prop = str(data.get('property') or '')
        if not isinstance(offset, int) or not prop:
            return self._json(400, {'error': 'missing charOffset/property'})
        payload = {
            'op': 'apply', 'file': full, 'charOffset': offset, 'property': prop,
            'allowMissing': bool(data.get('allowMissing')),
            'allowUnset': bool(data.get('allowUnset')),
        }
        if data.get('newValue') is not None:
            payload['newValue'] = data['newValue']
        return self._json(200, run_writeback(payload))

    def _edit_token(self, data):
        """Build the change record for a token-authored property edit (writeback-design.md §4)
        and queue it through the same claude -p worker the Feedback button already runs — see
        build_token_prompt. Never writes a file itself; the record IS the request."""
        full = _safe_rel(data.get('path'))
        if not full:
            return self._json(400, {'error': 'not a card in this design system'})
        prop = str(data.get('property') or '').strip()
        token = str(data.get('token') or '').strip()
        if not prop or not token.startswith('--'):
            return self._json(400, {'error': 'missing property/token'})
        session_id = str(data.get('session') or '')[:64] or None
        same_repeat, other_props = 0, []
        if session_id:
            hist = _edit_sessions.setdefault(session_id, [])
            same_repeat = sum(1 for h in hist if h['token'] == token and h['property'] == prop)
            other_props = sorted({h['property'] for h in hist if h['property'] != prop})
            hist.append({'token': token, 'property': prop})
        files, declarations = token_usage_breadth(token)
        defn = token_definition(token)
        record = {
            'kind': 'token-edit-intent',
            'file': os.path.relpath(full, ROOT),
            'element': str(data.get('element') or '')[:2000] or None,
            'property': prop,
            'authoredAs': f'var({token})',
            'token': token,
            'oldResolvedValue': data.get('oldResolvedValue'),
            'newResolvedValue': data.get('newResolvedValue'),
            'tokenUsage': {
                'totalFilesUsingToken': files,
                'declarationsFound': declarations,
                'definedIn': defn['file'] if defn else None,
                'definitionLine': defn['line'] if defn else None,
                'currentValues': defn['values'] if defn else [],
            },
            'matchesExistingToken': matches_existing_token(data.get('newResolvedValue')),
            'sessionContext': {
                'sameEditRepeatedOnOtherElements': same_repeat,
                'otherPropertiesEditedThisSession': other_props,
            },
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
        entry = {
            'id': uuid.uuid4().hex[:12],
            'ts': time.time(),
            'kind': 'token-edit',
            'path': record['file'],
            'name': str(data.get('name') or os.path.basename(full))[:200],
            'record': record,
            'status': 'queued' if SPAWN_CLAUDE else 'held',
        }
        with _queue_lock:
            entries = read_queue()
            entries.append(entry)
            write_queue(entries)
        if SPAWN_CLAUDE:
            _runs.put(entry)
        return self._json(200, {'ok': True, 'entry': entry, 'record': record})


def serve_also_on(port):
    """Answer on a second port as well, or explain why not and carry on. Never fatal.

    The user browses this gallery as http://sonora.test/, and that name resolves to 127.0.0.1 on
    both sides of the WSL boundary — Windows from its hosts file, this VM from WSL's own DNS
    forwarding. But the `netsh interface portproxy` rule that maps :80 onto this VM's :8888 lives
    only on the Windows side, so the two sides do not behave alike: a Windows-side browser gets
    the portproxy and a 200, while anything originating *inside* WSL hits 127.0.0.1:80 in the VM,
    where nothing listens, and reports a refused connection. VS Code's Simple Browser in a
    Remote-WSL window is exactly that second case, which is why the same URL that works for the
    user's Windows browser fails in their editor. Listening on 80 here as well makes one URL work
    from both.

    Binding below 1024 needs CAP_NET_BIND_SERVICE unless net.ipv4.ip_unprivileged_port_start says
    otherwise, which as shipped it does not — so the expected outcome today is the PermissionError
    branch, and 8888 must not be made conditional on any of this. A port already in use is handled
    the same way and even more quietly: something else answering on 80 is not this program's
    problem to solve or to complain about.
    """
    try:
        srv = http.server.ThreadingHTTPServer(('0.0.0.0', port), Handler)
    except PermissionError:
        print(f'docs/serve.py: port {port} needs privilege, serving {PORT} only — '
              f'`echo net.ipv4.ip_unprivileged_port_start=80 | sudo tee '
              f'/etc/sysctl.d/99-unprivileged-ports.conf && sudo sysctl --system` lifts that')
        return
    except OSError:
        return
    print(f'docs/serve.py: also serving on 0.0.0.0:{port} — http://sonora.test/ now resolves '
          f'from inside WSL too, not only Windows-side through the netsh portproxy')
    threading.Thread(target=srv.serve_forever, daemon=True).start()


def already_running():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', PORT)) == 0


def main():
    if already_running():
        print(f'docs/serve.py: port {PORT} already bound — assuming another instance is '
              f'already serving this repo, exiting quietly.')
        sys.exit(0)
    os.chdir(ROOT)
    # Line-buffered: this is almost always started with its output redirected to a file,
    # where Python block-buffers by default — so the banner below, including serve_also_on's
    # one-line hint about port 80, would sit in an unflushed buffer for the life of the
    # process and never be read by the person it is written for.
    sys.stdout.reconfigure(line_buffering=True)
    stale = reconcile_queue()
    # Says 0.0.0.0, not the loopback URL it is most often typed as: the bind below is wide, and a
    # banner claiming 127.0.0.1 was the only thing on screen suggesting otherwise.
    print(f'docs/serve.py: serving {ROOT} on 0.0.0.0:{PORT} — http://127.0.0.1:{PORT}/ here, and '
          f'reachable as any address this host answers to (that is what /_api/ is gated for)')
    print('docs/serve.py: feedback ' + ('spawns `claude -p` (SONORA_FEEDBACK_CLAUDE=0 to just queue)'
                                        if SPAWN_CLAUDE else 'is queue-only (SONORA_FEEDBACK_CLAUDE=0)'))
    if stale:
        print(f'docs/serve.py: marked {stale} queued/running feedback '
              f'{"entry" if stale == 1 else "entries"} failed — orphaned by an earlier exit')
    threading.Thread(target=run_worker, daemon=True).start()
    serve_also_on(ALT_PORT)
    # Bound to 0.0.0.0, not just loopback: a Windows-side `netsh interface portproxy`
    # rule (for a plain-port-80 hostname under WSL2) connects to this VM's real eth0
    # address, not 127.0.0.1 — a loopback-only bind refuses that traffic. The POST routes
    # carry their own origin check (Handler._cross_site_reason) rather than leaning on the
    # bind for their access control, since the bind cannot provide any.
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()

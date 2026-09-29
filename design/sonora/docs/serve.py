#!/usr/bin/env python3
r"""Persistent local server for gallery.html (and anything else in this repo) — the same
UTF-8-charset fix docs/render_cards.mjs uses internally, kept running instead of spun up
and torn down per check, plus the small JSON API the gallery's visual property editor calls
(see "The API" below).

Plain `python3 -m http.server` serves .html with no charset, so Chromium falls back to
Latin-1 and every em dash/bullet in the reference cards renders as mojibake. Also required
now that gallery.html embeds live <iframe>s pointing at the card files themselves: those
pull CDN scripts with pinned SRI hashes, which fail under file:// origins the same way
webfonts do. Serving over HTTP is also what makes the element picker possible at all —
parent and iframe share an origin only here, never under file://.

Idempotent: if the port is already bound (another instance already running), this exits quietly
rather than erroring — safe to invoke repeatedly without accumulating duplicate servers.

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

Two endpoints, both under /_api/edit/ (a path no real repo file can collide with — the leading
underscore names no directory here, and _safe_rel would reject it anyway):

  POST /_api/edit/resolve  {path, charOffset, property}  -> how that property is authored
  POST /_api/edit/apply    {path, charOffset, property, newValue?, allowMissing?, allowUnset?}
                                                          -> splices a literal value into the card

The apply POST writes a file, so both are gated on being same-origin JSON before they are
dispatched at all (see Handler._cross_site_reason), and `path` is not merely "somewhere under
ROOT" but "one of this design system's cards" (see _safe_rel). Neither check is theoretical: a
CORS-safelisted text/plain POST needs no preflight, so without the first, any page in any tab the
user has open could write a card, and without the second, `.git/config` was a valid target.
Only literal-authored values are ever written; a token-authored one is left for a person to
change in the source.
"""
import html
import http.server
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import traceback
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8888
ALT_PORT = 80   # see serve_also_on(); best-effort, never a precondition for PORT
MANIFEST = os.path.join(ROOT, '_ds_manifest.json')

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

_cards = {'mtime': None, 'files': frozenset()}


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
    ROOT" is not a tight enough test to hang the rest of this file on: /_api/edit/apply writes the
    named file, and `.git/config` is under ROOT — a core.fsmonitor
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


def node_binary():
    """Absolute path to a `node` that can run docs/edit_writeback.mjs, or None.

    This process's PATH is whatever the shell that started it handed it, which on this machine
    need not include the directory node itself lives in. which() still goes first so any node on PATH wins; the
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
        # Cache-Control does matter: a cached 200 would replay a stale answer about a file that
        # has since been written.
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlsplit(self.path)
        route = parsed.path
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

        /_api/edit/apply writes a card file with a value taken from the request body. An attacking
        page does not need to read the response — the side effect *is* the payload — and a
        text/plain POST is a CORS-"simple" request, so the browser sends it with no preflight and
        no chance for us to refuse.

        Three layers, cheapest first:
          * Content-Type must be JSON, which is not CORS-simple — so a cross-origin POST has to
            preflight, and this server answers OPTIONS with 501. That alone ends the drive-by.
          * Sec-Fetch-Site is set by the browser and cannot be forged by page script, so when it
            is present at all it must say same-origin.
          * Origin and Host must each name something this server is legitimately reached as
            (see ALLOWED_HOSTNAMES), which is what closes DNS rebinding.

        None of this constrains a non-browser client that can already route to the port, and
        nothing header-based could. What limits *that* exposure is the blast radius: _safe_rel
        accepts only card files, and everything a write does lands in the working tree where
        `git diff` shows it.
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
            if route == '/_api/edit/resolve':
                return self._edit_resolve(data)
            if route == '/_api/edit/apply':
                return self._edit_apply(data)
        except Exception as e:  # noqa: BLE001 - see below
            # A handler that raises answers with a dropped connection, which from the browser's
            # side is indistinguishable from the server being down — the gallery would report
            # "is docs/serve.py running?" about a server that is running fine. Anything landing
            # here is a bug, so keep the traceback and still answer.
            traceback.print_exc()
            return self._json(500, {'error': f'{type(e).__name__}: {e}'})
        return self.send_error(404)

    # --- the visual editor's writeback endpoints ---------------------------------------------
    #
    # Two-step by design: /resolve is a pure read (no file is touched) that the panel calls right
    # before Save to find out whether the property it is about to write is a literal (safe to
    # splice directly) or a `var(--token)` (never silently rewritten; the panel reports it
    # instead). /apply only ever runs on a property /resolve already confirmed literal-authored.

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


def serve_also_on(port):
    """Answer on a second port as well, or explain why not and carry on. Never fatal.

    The user browses this gallery as http://sonora.test/, and that name resolves to 127.0.0.1 on
    both sides of the WSL boundary — Windows from its hosts file, this VM from WSL's own DNS
    forwarding. But the `netsh interface portproxy` rule that maps :80 onto this VM's :8888 lives
    only on the Windows side, so the two sides do not behave alike: a Windows-side browser gets
    the portproxy and a 200, while anything originating *inside* WSL hits 127.0.0.1:80 in the VM,
    where nothing listens, and reports a refused connection. Listening on 80 here as well makes
    one URL work from both.

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
    # Says 0.0.0.0, not the loopback URL it is most often typed as: the bind below is wide, and a
    # banner claiming 127.0.0.1 was the only thing on screen suggesting otherwise.
    print(f'docs/serve.py: serving {ROOT} on 0.0.0.0:{PORT} — http://127.0.0.1:{PORT}/ here, and '
          f'reachable as any address this host answers to (that is what /_api/ is gated for)')
    serve_also_on(ALT_PORT)
    # Bound to 0.0.0.0, not just loopback: a Windows-side `netsh interface portproxy`
    # rule (for a plain-port-80 hostname under WSL2) connects to this VM's real eth0
    # address, not 127.0.0.1 — a loopback-only bind refuses that traffic. The POST routes
    # carry their own origin check (Handler._cross_site_reason) rather than leaning on the
    # bind for their access control, since the bind cannot provide any.
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()

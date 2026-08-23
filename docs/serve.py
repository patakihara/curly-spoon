#!/usr/bin/env python3
"""Persistent local server for gallery.html (and anything else in this repo) — the same
UTF-8-charset fix docs/render_cards.mjs uses internally, kept running instead of spun up
and torn down per check.

Plain `python3 -m http.server` serves .html with no charset, so Chromium falls back to
Latin-1 and every em dash/bullet in the reference cards renders as mojibake. Also required
now that gallery.html embeds live <iframe>s pointing at the card files themselves: those
pull CDN scripts with pinned SRI hashes, which fail under file:// origins the same way
webfonts do.

Idempotent: if the port is already bound (another instance already running, e.g. from a
previous VS Code window), this exits quietly rather than erroring — safe to invoke on every
folder-open without accumulating duplicate servers.

Uses ThreadingHTTPServer, not plain HTTPServer: the latter handles one request at a time,
synchronously — fine for a bare curl, but a real browser (or a proxying layer in front of it,
e.g. a port-forwarder holding a persistent/keep-alive connection open) can get an empty or
dropped response while the single worker is busy with something else.

    python3 docs/serve.py            # foreground, Ctrl-C to stop
    python3 docs/serve.py &          # background
"""
import http.server
import os
import socket
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8888


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
    }

    def log_message(self, *args):
        pass  # quiet — this runs unattended in the background


def already_running():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', PORT)) == 0


def main():
    if already_running():
        print(f'docs/serve.py: port {PORT} already bound — assuming another instance is '
              f'already serving this repo, exiting quietly.')
        sys.exit(0)
    os.chdir(ROOT)
    print(f'docs/serve.py: serving {ROOT} at http://127.0.0.1:{PORT}/ (gallery.html, cards, everything)')
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()

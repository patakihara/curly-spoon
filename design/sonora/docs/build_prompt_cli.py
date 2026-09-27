#!/usr/bin/env python3
"""Prints docs/serve.py::build_prompt(entry) for one JSON entry.

Verification-only helper (docs/EXTENSION-PLAN.md §4 "1.4"): lets
extension/test/check_build_prompt.mjs diff extension/lib/queue.js's JS port of
build_prompt against the real Python implementation, without importing serve.py's
HTTP server machinery — importing the module alone never binds a socket or starts a
thread (see serve.py's own `if __name__ == '__main__':` guard; everything above it is
plain function/class/constant definitions).

Usage: python3 docs/build_prompt_cli.py '<json entry>'   (or the entry on stdin)
Prints the prompt to stdout with no trailing newline, so a byte-for-byte diff against
the JS port needs no trimming on either side.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import serve  # noqa: E402  (path insert above must run first)


def main():
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    entry = json.loads(raw)
    sys.stdout.write(serve.build_prompt(entry))


if __name__ == '__main__':
    main()

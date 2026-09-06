#!/usr/bin/env bash
# Sonora Design — install into this machine's Remote-WSL VS Code extension host.
#
# docs/EXTENSION-PLAN.md §2: "Install = symlink the folder into
# ~/.vscode-server/extensions/ and register it in that directory's extensions.json
# (VS Code treats that file as the authoritative list; the symlink alone is not
# enough — see spotlight's install.ps1 header). extension/install.sh does both,
# idempotently."
#
# Always symlinks the MAIN checkout's extension/ — never a worktree's, which is
# deleted after landing (§4 "1.1" deliverable 6; same rule claude-spotlight's own
# install.ps1 documents for itself).
set -euo pipefail

MAIN_CHECKOUT="/home/sofiapata/src/sonora"
EXT_SRC="$MAIN_CHECKOUT/extension"
EXT_ID="opesus-local.sonora-design"
EXT_VERSION="0.1.0"
EXT_TARGET="$HOME/.vscode-server/extensions/${EXT_ID}-${EXT_VERSION}"
EXTENSIONS_JSON="$HOME/.vscode-server/extensions/extensions.json"

if [[ ! -d "$EXT_SRC" ]]; then
  echo "sonora/install.sh: $EXT_SRC does not exist — run this against the main checkout, not a worktree" >&2
  exit 1
fi

# Symlink: idempotent — only touch it if it doesn't already resolve to EXT_SRC.
if [[ -L "$EXT_TARGET" && "$(readlink -f "$EXT_TARGET")" == "$(readlink -f "$EXT_SRC")" ]]; then
  :
else
  rm -rf "$EXT_TARGET"
  ln -s "$EXT_SRC" "$EXT_TARGET"
fi

# extensions.json: add/refresh only this extension's entry. VS Code writes this file
# as one compact single-line JSON array with no inter-entry whitespace — re-serializing
# the whole thing with a pretty-printer would touch every other extension's byte range
# even though nothing about them changed, so this walks the array at the text level and
# only replaces our own entry's substring (see patch below). Atomic via a temp file +
# rename in the same directory (same filesystem, so the rename can't be interrupted
# midway).
python3 - "$EXTENSIONS_JSON" "$EXT_ID" "$EXT_VERSION" "$EXT_TARGET" <<'PYEOF'
import json
import os
import sys
import tempfile
import time

extensions_json, ext_id, ext_version, ext_target = sys.argv[1:5]

with open(extensions_json, 'r', encoding='utf-8') as f:
    raw = f.read()

body = raw.rstrip('\n')
trailing_newline = raw.endswith('\n')
assert body.startswith('[') and body.endswith(']'), f'{extensions_json} is not a JSON array'
inner = body[1:-1]


def split_top_level(s):
    """Top-level comma-separated JSON values in `s`, as raw substrings — never
    reparsed into new text, so every entry we don't touch keeps its exact bytes."""
    items = []
    depth = 0
    in_str = False
    escape = False
    start = 0
    for i, c in enumerate(s):
        if in_str:
            if escape:
                escape = False
            elif c == '\\':
                escape = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c in '{[':
            depth += 1
        elif c in '}]':
            depth -= 1
        elif c == ',' and depth == 0:
            items.append(s[start:i])
            start = i + 1
    tail = s[start:]
    if tail.strip():
        items.append(tail)
    return items


def entry_id(item):
    try:
        return json.loads(item).get('identifier', {}).get('id')
    except Exception:
        return None


items = split_top_level(inner) if inner.strip() else []
items = [it for it in items if entry_id(it) != ext_id]

new_entry = {
    'identifier': {'id': ext_id},
    'version': ext_version,
    'location': {'$mid': 1, 'path': ext_target, 'scheme': 'file'},
    'relativeLocation': os.path.basename(ext_target),
    'metadata': {
        'installedTimestamp': int(time.time() * 1000),
        'source': 'vsix',
    },
}
items.append(json.dumps(new_entry, separators=(',', ':')))

new_body = '[' + ','.join(items) + ']'
if trailing_newline:
    new_body += '\n'

fd, tmp = tempfile.mkstemp(dir=os.path.dirname(extensions_json))
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(new_body)
    os.replace(tmp, extensions_json)
except Exception:
    os.unlink(tmp)
    raise
PYEOF

echo "sonora/install.sh: installed $EXT_ID $EXT_VERSION -> $EXT_TARGET"
echo "reload the window"

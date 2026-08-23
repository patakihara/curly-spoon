#!/usr/bin/env python3
"""Replay DesignSync get_file results out of a session transcript onto disk.

get_file has no localPath escape hatch the way write_files does, so a fetched file lands in
some model's context whether we like it or not. But it also lands in that model's transcript,
verbatim. Replaying from there costs nothing and removes the retyping step, so a file cannot be
corrupted by transcription.

  python3 extract_ds.py DEST TRANSCRIPT [TRANSCRIPT...] [--skip=GLOB ...]

GUARD: a transcript holds every fetch ever made in that session, including ones made BEFORE a
newer version of that same path was pushed. Replaying those blindly reverts real work — it
silently reverted two just-pushed reference cards the first time this was tried by hand. So the
caller decides what to exclude with --skip; this script has no way to know on its own which of
its own fetches are stale.
"""
import json, os, sys, fnmatch

DEST = sys.argv[1]
SKIP = [a.split('=', 1)[1] for a in sys.argv[2:] if a.startswith('--skip=')]
TRANSCRIPTS = [a for a in sys.argv[2:] if not a.startswith('--')]
found = {}

def walk(node):
    if isinstance(node, dict):
        for v in node.values():
            walk(v)
    elif isinstance(node, list):
        for v in node:
            walk(v)
    elif isinstance(node, str):
        if '"method":"get_file"' in node and '"content":' in node:
            try:
                d = json.loads(node)
            except Exception:
                return
            if isinstance(d, dict) and d.get('method') == 'get_file' and 'path' in d:
                found[d['path']] = d

for t in TRANSCRIPTS:
    if not os.path.exists(t):
        print('  MISSING transcript:', t); continue
    for line in open(t, encoding='utf-8', errors='replace'):
        line = line.strip()
        if not line or 'get_file' not in line:
            continue
        try:
            walk(json.loads(line))
        except Exception:
            continue

written, skipped = [], []
for path, d in sorted(found.items()):
    if any(fnmatch.fnmatch(path, p) for p in SKIP):
        skipped.append(path); continue
    if d.get('isBase64') or d.get('truncated'):
        skipped.append(path + '  (binary/truncated)'); continue
    full = os.path.join(DEST, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8', newline='') as f:
        f.write(d['content'])
    written.append(path)

print('replayed %d files, skipped %d' % (len(written), len(skipped)))
for p in skipped:
    print('   skip:', p)

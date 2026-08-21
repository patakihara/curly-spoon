#!/usr/bin/env python3
"""Recover the reference screenshots Sofia sent, out of the session transcript.

They were never written to disk when they arrived — they only ever existed as image
blocks in the conversation. That left docs/screens/S01..S43.md referring to screenshots
nobody could actually look at, so the mapping from screenshot to component could not be
checked against its source. This puts them back.

Two things it must not confuse with a sent screenshot:
  - images nested inside a tool_result (the card renders read back with the Read tool)
  - anything landscape (every phone screenshot here is portrait)

    python3 docs/extract_screenshots.py [transcript.jsonl]
"""
import base64, json, os, struct, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "reference", "spotify")
DEFAULT = os.path.expanduser(
    "~/.claude/projects/-home-sofiapata/2385ed04-b55b-51c3-a8a0-e96f4b66ab38.jsonl")


def dimensions(raw):
    """(width, height, ext) straight from the container header — no image library needed."""
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", raw[16:24])
        return w, h, "png"
    if raw[:2] == b"\xff\xd8":
        i = 2
        while i < len(raw) - 9:
            if raw[i] != 0xFF:
                i += 1
                continue
            marker, seglen = raw[i + 1], struct.unpack(">H", raw[i + 2:i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3):
                h, w = struct.unpack(">HH", raw[i + 5:i + 9])
                return w, h, "jpg"
            i += 2 + seglen
    return None, None, "bin"


def collect(node, found):
    """Depth-first, in document order, refusing to descend into tool results."""
    if isinstance(node, dict):
        if node.get("type") == "tool_result":
            return
        if node.get("type") == "image" and isinstance(node.get("source"), dict):
            data = node["source"].get("data")
            if isinstance(data, str):
                found.append(data)
            return
        for v in node.values():
            collect(v, found)
    elif isinstance(node, list):
        for item in node:
            collect(item, found)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT
    found = []
    with open(path) as fh:
        for line in fh:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            # A pasted image lands in its own `attachment` record under `prompt`, NOT inside the
            # user message. Images anywhere else in the transcript are tool results — the card
            # renders read back with the Read tool — and must not be mistaken for sent material.
            if rec.get("type") == "attachment":
                collect((rec.get("attachment") or {}).get("prompt"), found)

    os.makedirs(OUT, exist_ok=True)
    kept, skipped = [], 0
    for b64 in found:
        try:
            raw = base64.b64decode(b64)
        except Exception:
            continue
        w, h, ext = dimensions(raw)
        if not w or h <= w:          # landscape => a card render, not a phone screenshot
            skipped += 1
            continue
        kept.append((raw, w, h, ext))

    for i, (raw, w, h, ext) in enumerate(kept, 1):
        name = "S%02d.%s" % (i, ext)
        with open(os.path.join(OUT, name), "wb") as fh:
            fh.write(raw)
        print("  %-10s %4dx%-5d %6.0f KB" % (name, w, h, len(raw) / 1024))
    print("\nwrote %d portrait screenshots to assets/reference/spotify/ (skipped %d landscape)"
          % (len(kept), skipped))
    return 0 if kept else 1


if __name__ == "__main__":
    sys.exit(main())

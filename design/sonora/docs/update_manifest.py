#!/usr/bin/env python3
"""Bring _ds_manifest.json in step with what is actually on disk.

The manifest is normally compiled by the app's own self-check, but until that runs the
project is in a broken intermediate state: `_ds_bundle.js` is generated FROM `components[]`,
so a component that exists as a file but is missing from that array is not exported on the
namespace — and every card demoing it renders blank. That reads as "the component is broken"
rather than "the manifest is stale", which is why this is worth doing by hand.

Two rules keep this honest:
  - `components[]` is rebuilt from the .jsx files themselves, grouped in directory order and
    alphabetical within a group.
  - `cards[]` entries are read from each card's own first-line @dsCard marker, never retyped,
    so the manifest and the marker cannot disagree. A card whose file is gone is dropped.

Everything else in the manifest — tokens, themes, brandFonts, globalCssPaths — is app-derived
and is passed through unchanged.

    python3 docs/update_manifest.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "_ds_manifest.json")

GROUP_DIRS = ["core", "forms", "layout", "media", "navigation"]
GROUP_ORDER = ["Brand", "Colors", "Components", "Layout",
               "Spacing", "Type", "Reference"]

MARKER = re.compile(r"<!--\s*@dsCard\s+(.*?)-->", re.S)


def marker_of(path):
    with open(path) as fh:
        first = fh.readline()
    m = MARKER.search(first)
    if not m:
        return None
    attrs = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
    if "group" not in attrs or "name" not in attrs:
        return None
    return attrs


def main():
    man = json.load(open(MANIFEST))
    before = (len(man["components"]), len(man["cards"]))

    # --- components: rebuilt from disk, manifest's own ordering convention -----------------
    components = []
    for d in GROUP_DIRS:
        dirpath = os.path.join(ROOT, "components", d)
        if not os.path.isdir(dirpath):
            continue
        for f in sorted(x for x in os.listdir(dirpath) if x.endswith(".jsx")):
            name = f[:-4]
            components.append({"name": name, "sourcePath": "components/%s/%s" % (d, f)})
    known = {c["name"] for c in man["components"]}
    added_c = [c["name"] for c in components if c["name"] not in known]

    # --- cards: upsert from each file's own marker ----------------------------------------
    cards = [c for c in man["cards"] if os.path.exists(os.path.join(ROOT, c["path"]))]
    by_path = {c["path"]: c for c in cards}
    found = []
    for base, _dirs, files in os.walk(ROOT):
        if os.sep + ".git" in base:
            continue
        for f in sorted(files):
            if not f.endswith(".card.html"):
                continue
            full = os.path.join(base, f)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            attrs = marker_of(full)
            if not attrs:
                print("  WARN  no usable @dsCard marker: %s" % rel)
                continue
            entry = {"path": rel, "group": attrs["group"], "name": attrs["name"]}
            if attrs.get("viewport"):
                entry["viewport"] = attrs["viewport"]
            if attrs.get("subtitle"):
                entry["subtitle"] = attrs["subtitle"]
            found.append(rel)
            if rel in by_path:
                by_path[rel].update(entry)
            else:
                cards.append(entry)
                by_path[rel] = entry

    added_k = [p for p in found if p not in {c["path"] for c in man["cards"]}]
    rank = {g: i for i, g in enumerate(GROUP_ORDER)}
    cards.sort(key=lambda c: (rank.get(c["group"], 50), c.get("name", "")))

    man["components"] = components
    man["cards"] = cards
    with open(MANIFEST, "w") as fh:
        json.dump(man, fh, ensure_ascii=False, separators=(",", ":"))

    print("components %d -> %d   cards %d -> %d" % (before[0], len(components), before[1], len(cards)))
    if added_c:
        print("  + components: %s" % ", ".join(added_c))
    if added_k:
        print("  + cards: %d" % len(added_k))
    for g in GROUP_ORDER:
        n = sum(1 for c in cards if c["group"] == g)
        if n:
            print("      %-12s %d" % (g, n))
    return 0


if __name__ == "__main__":
    sys.exit(main())

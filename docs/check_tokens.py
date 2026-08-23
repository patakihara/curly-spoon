#!/usr/bin/env python3
"""Fail on any var(--token) that Sonora does not define.

An undefined custom property is not a CSS error — the declaration is simply dropped
and the element inherits. So `color: var(--state-warning-ink)` renders as *nothing at
all*, and the only symptom is text quietly taking the wrong colour on the one
background it most needed to contrast against. That shipped once in this wave.

Sonora builds token names by concatenation — `'var(--text-' + size + ')'` — so a
naive scan either misses the bug or drowns in false positives. Two forms, treated
differently:

  var(--text-' + size + ')          prefix only  -> some defined token must start with it
  var(--state-' + tone + '-ink)     prefix+tail  -> some defined token must match BOTH

The second form is the one that bit, and only the second form is checked strictly
enough to catch it. Token list mirrors _ds_manifest.json's `tokens` array.
"""
import os, re, sys

# Read the token list from the manifest rather than restating it. A hardcoded copy drifts the
# moment the design app adds a token, and it drifted exactly that way: --weight-super-strong,
# --weight-medium, --weight-regular, --display-weight, --display-stretch, --divider and
# --scroll-edge all existed upstream while this list still said they did not, so a correct
# component read as nine failures.
def _load_tokens():
    import json
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    m = json.load(open(os.path.join(here, '_ds_manifest.json')))
    return set(t['name'] for t in m['tokens'])

TOKENS = _load_tokens()

# A complete, literal reference: var(--surface-fg)
STATIC = re.compile(r"var\(\s*(--[A-Za-z0-9-]+)\s*\)")
# A concatenated one: var(--PREFIX' + expr + 'TAIL)  — TAIL may be empty.
DYNAMIC = re.compile(r"var\(\s*(--[A-Za-z0-9-]*)'.{0,240}?'([A-Za-z0-9-]*)\s*\)", re.S)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    problems, scanned = [], 0
    for base, _dirs, files in os.walk(ROOT):
        if os.sep + ".git" in base or os.sep + ".render" in base:
            continue
        for f in sorted(files):
            if not f.endswith((".jsx", ".html")):
                continue
            p = os.path.join(base, f)
            rel = os.path.relpath(p, ROOT)
            scanned += 1
            src = open(p).read()

            for tok in sorted(set(STATIC.findall(src))):
                if tok not in TOKENS:
                    problems.append((rel, "undefined token %s" % tok))

            for prefix, tail in set(DYNAMIC.findall(src)):
                if not any(t.startswith(prefix) and t.endswith(tail) for t in TOKENS):
                    problems.append((rel, "no token matches %s*%s" % (prefix, tail)))

            # CoverArt fills its parent with position:absolute;inset:0, so the parent MUST be a
            # containing block. Without one the gradient resolves against some distant ancestor
            # and paints over the whole component — which looks like a broken component, not a
            # missing style. Three components shipped this before a browser caught it.
            for m in re.finditer(r"<CoverArt", src):
                back = src[max(0, m.start() - 420):m.start()]
                # last style block before the tag is the container's
                if not re.search(r"position\s*:\s*'?(relative|absolute|fixed|sticky)", back):
                    problems.append((rel, "<CoverArt> parent is not a containing block "
                                          "(needs position:relative) — it will cover its ancestor"))

    print("scanned %d files" % scanned)
    for rel, msg in sorted(problems):
        print("  FAIL  %-42s %s" % (rel, msg))
    if problems:
        print("\n%d problem(s)" % len(problems))
        return 1
    print("every var() reference resolves to a defined token")
    return 0


if __name__ == "__main__":
    sys.exit(main())

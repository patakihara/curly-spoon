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

TOKENS = set("""
--neutral-950 --neutral-900 --neutral-850 --neutral-700 --neutral-500 --neutral-300
--neutral-100 --neutral-50 --neutral-0
--surface-bg --surface-bg-alt --surface-card --surface-fg --surface-fg-muted
--surface-border --surface-overlay-header --surface-hover
--scrim-soft --scrim --scrim-strong --on-scrim
--accent --accent-contrast --accent-ink
--accent-red --accent-orange --accent-amber --accent-yellow --accent-lime --accent-green
--accent-emerald --accent-teal --accent-cyan --accent-sky --accent-blue --accent-indigo
--accent-violet --accent-purple --accent-fuchsia --accent-pink --accent-rose
--tone-library --tone-request --tone-progress --tone-error
--tone-library-ink --tone-request-ink --tone-progress-ink --tone-error-ink
--state-error --state-success --state-warning --state-info
--surface-now-playing --surface-now-playing-fg --surface-now-playing-fg-muted
--art-gradient-start --art-gradient-end
--font-body --font-display --font-heading
--text-xs --text-sm --text-md --text-lg --text-xl --text-2xl --text-3xl --text-4xl --text-5xl
--leading-xs --leading-sm --leading-md --leading-lg --leading-xl
--weight-body --weight-strong --heading-weight
--h1-size --h1-leading --h2-size --h2-leading --h3-size --h3-leading --h4-size --h4-leading
--space-0 --space-xs --space-sm --space-md --space-lg --space-xl --space-2xl --space-3xl --space-4xl
--spacing-xs --spacing-sm --spacing-md --spacing-lg --spacing-xl --spacing-2xl
--grid-gap --icon-xs --icon-sm --icon-md --miniplayer-album-size
--grid-columns --grid-columns-mobile --grid-gutter --grid-gutter-mobile
--grid-margin --grid-margin-mobile --grid-item-min --grid-item-min-mobile
--grid-item-min-wide --grid-item-min-wide-mobile --grid-item-max --grid-item-max-mobile
--grid-item-max-wide --grid-item-max-wide-mobile
--grid-max-width --grid-max-width-tiles --grid-max-width-list --grid-max-width-form
--breakpoint-compact --rail-width-expanded --rail-width-collapsed --rail-row-height
--side-sheet-width --content-min-width --appbar-height --appbar-height-mobile
--appbar-controls-height --bottom-app-bar-height --now-playing-art-max --now-playing-preview-height
--radius-xs --radius-sm --radius-md --radius-lg --radius-pill
--ease-standard --duration-instant --duration-fast --duration-quick --duration-medium --duration-slow
--shadow-xs --shadow-sm --shadow-md --shadow-lg --shadow-xl --shadow-xxl
""".split())

# A complete, literal reference: var(--surface-fg)
STATIC = re.compile(r"var\(\s*(--[A-Za-z0-9-]+)\s*\)")
# A concatenated one: var(--PREFIX' + expr + 'TAIL)  — TAIL may be empty.
DYNAMIC = re.compile(r"var\(\s*(--[A-Za-z0-9-]*)'.{0,240}?'([A-Za-z0-9-]*)\s*\)", re.S)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    problems, scanned = [], 0
    for base, _dirs, files in os.walk(os.path.join(ROOT, "components")):
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

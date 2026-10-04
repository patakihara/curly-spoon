#!/usr/bin/env python3
"""Regenerate _adherence.oxlintrc.json's per-component rules from the .d.ts files.

Unlike export/component-api.md there is no generator for this in the project: it is produced
app-side, so this reproduces it. scripts/sonora/adherence.test.mjs runs it into a temporary file
and fails unless the committed file equals that output, so a prop change cannot leave a rule stale.

Two rule shapes, both read off the app's own file rather than invented:

  prop allowlist   JSXOpeningElement[name.name='X'] > JSXAttribute > JSXIdentifier[name!=/^(?:...)$/]
  literal union    JSXOpeningElement[name.name='X'] > JSXAttribute[name.name='p'] > Literal[value!=/^(?:...)$/]

The allowlist suffix is always key|ref|className|style|children, appended verbatim, which is why
a component declaring `children` lists it twice. That duplication is in the original; reproducing
it is the point.

    python3 docs/gen_adherence.py                # rewrite it
    python3 docs/gen_adherence.py --out <path>   # write the result to <path> instead
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "_adherence.oxlintrc.json")
GROUP_DIRS = ["basic", "components", "layouts"]
ALWAYS = ["key", "ref", "className", "style", "children"]

BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"//[^\n]*")
PROP = re.compile(r"^([A-Za-z_$][\w$]*)(\??):\s*(.+?);?$")


INTERFACE = re.compile(r"(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)")


def interfaces(src):
    """Every interface name in the file, in declaration order."""
    return INTERFACE.findall(LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", src)))


def props_of(src, iface):
    """Depth-1 members of `interface <iface>`, in declaration order."""
    m = re.search(r"interface\s+%s\b[^{]*\{" % re.escape(iface), src)
    if not m:
        return None
    i, depth, body = m.end(), 1, []
    while i < len(src) and depth:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if not depth:
                break
        body.append(c)
        i += 1
    body = LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", "".join(body)))

    out, depth, buf = [], 0, ""
    for ch in body:
        if ch in "{([":
            depth += 1
        elif ch in "})]":
            depth -= 1
        if ch in ";\n" and depth <= 0:
            line = " ".join(buf.split())
            buf = ""
            if not line:
                continue
            p = PROP.match(line)
            if p:
                out.append((p.group(1), p.group(3).strip()))
        else:
            buf += ch
    line = " ".join(buf.split())
    if line:
        p = PROP.match(line)
        if p:
            out.append((p.group(1), p.group(3).strip()))
    return out


def literal_union(t):
    """['sm','lg'] for a type made only of quoted literals, and perhaps null; None otherwise.

    A null in the union is dropped: JSX writes null as {null}, never as a string literal, so the
    rule on a string literal holds the words alone."""
    parts = [p.strip() for p in t.split("|") if p.strip() != "null"]
    if len(parts) < 2:
        return None
    vals = []
    for p in parts:
        m = re.fullmatch(r"'([^']*)'", p)
        if not m:
            return None
        vals.append(m.group(1))
    return vals


def build():
    rules = []
    for d in GROUP_DIRS:
        dirpath = os.path.join(ROOT, "components", d)
        if not os.path.isdir(dirpath):
            continue
        for f in sorted(x for x in os.listdir(dirpath) if x.endswith(".d.ts")):
            stem = f[:-5]
            src = open(os.path.join(dirpath, f)).read()
            found = interfaces(src)
            if not found:
                print("  WARN  no interface in components/%s/%s" % (d, f))
                continue
            # The app keys each file's rules off its FIRST interface, stripping a trailing
            # "Props" — so a file that declares a helper shape first (QueuePage.d.ts's
            # QueueItem) documents that instead of the component. Reproduced as-is
            # so nothing regresses, then the component's own Props interface is added alongside,
            # which is what actually gets written in JSX.
            targets = [found[0]]
            if stem + "Props" in found and found[0] != stem + "Props":
                targets.append(stem + "Props")
            for iface in targets:
                emit(rules, iface, props_of(src, iface))
    return rules


def emit(rules, iface, props):
            if props is None:
                return
            name = iface[:-5] if iface.endswith("Props") else iface
            names = [p for p, _ in props]
            rules.append({
                "selector": "JSXOpeningElement[name.name='%s'] > JSXAttribute > "
                            "JSXIdentifier[name!=/^(?:%s)$/]" % (name, "|".join(names + ALWAYS)),
                "message": "<%s> doesn't accept that prop. Declared props: %s."
                           % (name, ", ".join(names)),
            })
            for prop, typ in props:
                vals = literal_union(typ)
                if not vals:
                    continue
                rules.append({
                    "selector": "JSXOpeningElement[name.name='%s'] > JSXAttribute[name.name='%s'] > "
                                "Literal[value!=/^(?:%s)$/]" % (name, prop, "|".join(vals)),
                    "message": "<%s> %s must be one of %s."
                               % (name, prop, " | ".join("'%s'" % v for v in vals)),
                })


def main():
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else CONFIG
    cfg = json.load(open(CONFIG))
    existing = cfg["rules"]["no-restricted-syntax"]
    severity, old = existing[0], existing[1:]
    globals_ = [r for r in old if "name.name=" not in r["selector"]]
    new_comp = build()

    def comp(sel):
        m = re.search(r"name\.name='(\w+)'", sel)
        return m.group(1) if m else "?"

    cfg["rules"]["no-restricted-syntax"] = [severity] + globals_ + new_comp

    # x-omelette.components is a parallel index of the same names, alphabetical: an entry keeps its
    # `replaces` list, and a component that no longer exists loses its entry.
    omelette = cfg.setdefault("x-omelette", {}).setdefault("components", {})
    names = sorted({comp(r["selector"]) for r in new_comp})
    cfg["x-omelette"]["components"] = {
        n: omelette.get(n, {"replaces": []}) for n in names
    }
    with open(out, "w") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("wrote %s (%d globals + %d component rules)" % (out, len(globals_), len(new_comp)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

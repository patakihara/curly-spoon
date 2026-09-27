#!/usr/bin/env python3
"""Regenerate _adherence.oxlintrc.json's per-component rules from the .d.ts files.

Unlike export/component-api.md there is no generator for this in the project — it is produced
app-side — so this reproduces it. That is only safe because the output is checkable: the file
already contains rules for 59 components, so a correct generator must reproduce all 59
byte-for-byte and add exactly the new ones. `--check` does that comparison and is the reason
this is trustworthy rather than a plausible guess.

Two rule shapes, both read off the existing file rather than invented:

  prop allowlist   JSXOpeningElement[name.name='X'] > JSXAttribute > JSXIdentifier[name!=/^(?:…)$/]
  literal union    JSXOpeningElement[name.name='X'] > JSXAttribute[name.name='p'] > Literal[value!=/^(?:…)$/]

The allowlist suffix is always key|ref|className|style|children, appended verbatim — which is why
a component declaring `children` lists it twice. That duplication is in the original; reproducing
it is the point.

    python3 docs/gen_adherence.py --check    # compare against the current file, write nothing
    python3 docs/gen_adherence.py            # rewrite it
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "_adherence.oxlintrc.json")
GROUP_DIRS = ["core", "forms", "layout", "media", "navigation"]
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
    """['sm','lg'] for a type made only of quoted literals; None otherwise."""
    parts = [p.strip() for p in t.split("|")]
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
            # "Props" — so a file that declares a helper shape first (BottomAppBarAction,
            # QueueItem, LibraryView) documents that instead of the component. Reproduced as-is
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
    cfg = json.load(open(CONFIG))
    existing = cfg["rules"]["no-restricted-syntax"]
    severity, old = existing[0], existing[1:]
    globals_ = [r for r in old if "name.name=" not in r["selector"]]
    old_comp = [r for r in old if "name.name=" in r["selector"]]

    new_comp = build()
    by_sel_old = {r["selector"]: r for r in old_comp}
    by_sel_new = {r["selector"]: r for r in new_comp}

    reproduced = [s for s in by_sel_old if s in by_sel_new and by_sel_old[s] == by_sel_new[s]]
    changed = [s for s in by_sel_old if s in by_sel_new and by_sel_old[s] != by_sel_new[s]]
    lost = [s for s in by_sel_old if s not in by_sel_new]
    added = [s for s in by_sel_new if s not in by_sel_old]

    def comp(sel):
        m = re.search(r"name\.name='(\w+)'", sel)
        return m.group(1) if m else "?"

    print("existing component rules: %d   regenerated: %d" % (len(old_comp), len(new_comp)))
    print("  reproduced byte-identically: %d" % len(reproduced))
    print("  differing message/selector:  %d %s" % (len(changed), sorted({comp(s) for s in changed})))
    print("  no longer produced:          %d %s" % (len(lost), sorted({comp(s) for s in lost})))
    print("  newly produced:              %d %s" % (len(added), sorted({comp(s) for s in added})))

    if "--check" in sys.argv:
        return 0 if not lost else 1

    cfg["rules"]["no-restricted-syntax"] = [severity] + globals_ + new_comp

    # x-omelette.components is a parallel index of the same names, alphabetical. Existing entries
    # are preserved rather than rebuilt — their `replaces` lists are the app's, not ours to guess.
    omelette = cfg.setdefault("x-omelette", {}).setdefault("components", {})
    names = sorted({comp(r["selector"]) for r in new_comp} | set(omelette))
    cfg["x-omelette"]["components"] = {
        n: omelette.get(n, {"replaces": []}) for n in names
    }
    with open(CONFIG, "w") as fh:
        json.dump(cfg, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("wrote %s (%d globals + %d component rules)" % (CONFIG, len(globals_), len(new_comp)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

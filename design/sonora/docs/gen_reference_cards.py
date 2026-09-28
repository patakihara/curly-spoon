#!/usr/bin/env python3
"""Generate the Reference card group: one card per source screenshot, plus an index.

The Design System pane's unit of display is a card, so "the screenshots and their
documentation" has to BE cards or it is invisible there. Each one pairs the original
screenshot with what that screen actually produced — so a reviewer can check the
affordance mapping against its source instead of taking it on trust.

Driven by the same SCREENS mapping that writes docs/screens/*.md, so the two cannot
drift. The documentation half is plain HTML; below it each card renders live examples of
the components that screen created or extended, inlined from docs/examples/*.snippet.jsx,
so the claim "this screen produced these components" can be looked at rather than read.

    python3 docs/gen_reference_cards.py
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_screens import SCREENS  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "reference")

EXAMPLES_DIR = os.path.join(HERE, "examples")
NAMESPACE = "SonoraDesignSystem_6c1435"

# The documentation half is unchanged and every current card fits inside 700px of it, so
# 700 is a safe upper bound for the top region. Everything below it is fixed-size by
# construction, which makes the card's total height exact rather than guessed:
#   TOP + EX_HEAD + rows*EX_ROW + (rows-1)*EX_GAP + EX_PAD
TOP = 700
EX_COLS = 2
EX_BOX = 280      # .exbox, fixed height
EX_LABEL = 26     # .exlabel line + its margin
EX_ROW = EX_BOX + EX_LABEL
EX_GAP = 24
EX_HEAD = 57      # section border-top + padding-top + the h2 and its margin
EX_PAD = 24       # section padding-bottom
INDEX_VIEWPORT = "1180x820"

# Copied character for character from components/basic/buttons.card.html — the
# pinned versions and their SRI hashes are what the render harness serves from its local
# vendor cache. Only the bundle tag differs: reference/ is one directory deep, not two.
CDN = """<script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
<script src="../_ds_bundle.js"></script>"""

with open(os.path.join(ROOT, "_ds_manifest.json")) as _fh:
    KNOWN = {c["name"] for c in json.load(_fh)["components"]}

IDENT = re.compile(r"\b[A-Z][A-Za-z0-9_]*\b")


def snippet(name):
    """The one JSX expression documenting `name`, or None if nobody wrote one.

    A component with no snippet is skipped silently: a card that renders <Foo/> for a
    component that has no example is a broken tag, which reads as a broken component."""
    p = os.path.join(EXAMPLES_DIR, "%s.snippet.jsx" % name)
    if not os.path.exists(p):
        return None
    with open(p) as fh:
        return fh.read().strip()


def needed(src):
    """Namespace names a snippet uses. Over-inclusive on purpose — every capitalised word
    that happens to name a real component gets destructured, even from inside a string. An
    unused binding costs nothing; a missing one is a ReferenceError at render time."""
    return set(IDENT.findall(src)) & KNOWN


def inline(s):
    """The mapping is written in markdown; cards are HTML. Convert the two marks it uses."""
    s = html.escape(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
    return s


def attr(s):
    """@dsCard attribute values are double-quoted; the manifest escapes inner quotes this way."""
    return html.escape(s, quote=True).replace('"', "&quot;")


HEAD = """<!-- @dsCard group="Reference" viewport="{vp}" name="{name}" subtitle="{subtitle}" -->
<link rel="stylesheet" href="../styles.css">
{cdn}
<style id="__card-page-css">
html,body{{margin:0;background:var(--surface-bg);color:var(--surface-fg);font-family:var(--font-body)}}
.wrap{{display:flex;gap:var(--spacing-2xl);padding:var(--spacing-2xl);align-items:flex-start}}
.shot{{width:280px;flex-shrink:0;border-radius:var(--radius-sm);border:1px solid var(--surface-border);display:block}}
.col{{flex:1;min-width:0}}
h1{{font-family:var(--font-heading);font-weight:var(--weight-super-strong);font-size:var(--h3-size);margin:0 0 4px}}
.src{{color:var(--surface-fg-muted);font-size:var(--text-sm);margin:0 0 var(--spacing-lg)}}
h2{{font-size:var(--text-xs);font-weight:var(--weight-strong);letter-spacing:.09em;text-transform:uppercase;
   color:var(--surface-fg-muted);margin:var(--spacing-lg) 0 var(--spacing-sm)}}
ul{{margin:0;padding-left:1.1em}}
li{{font-size:var(--text-sm);line-height:1.5;margin-bottom:4px}}
code{{font-family:ui-monospace,monospace;font-size:.92em;background:var(--surface-card);
     padding:1px 5px;border-radius:var(--radius-xs)}}
.row{{font-size:var(--text-sm);line-height:1.6;margin-bottom:2px}}
.tag{{display:inline-block;min-width:78px;font-weight:var(--weight-strong);font-size:var(--text-xs);
     text-transform:uppercase;letter-spacing:.06em;color:var(--surface-fg-muted)}}
.new code{{color:var(--accent-ink)}}
.ext code{{color:var(--state-warning)}}
.none{{color:var(--surface-fg-muted);font-size:var(--text-sm)}}
.ex{{border-top:1px solid var(--surface-border);padding:{pt}px var(--spacing-2xl) {pb}px}}
.exh{{margin:0 0 16px;line-height:16px}}
.exgrid{{display:grid;grid-template-columns:repeat({cols}, minmax(0, 1fr));gap:{gap}px}}
.exlabel{{font-size:var(--text-sm);line-height:18px;margin:0 0 8px}}
.exbox{{height:{box}px;box-sizing:border-box;padding:var(--spacing-lg);display:flex;
       align-items:center;justify-content:center;border:1px solid var(--surface-border);
       border-radius:var(--radius-sm);background:var(--surface-bg-alt)}}
.exmiss{{max-width:100%;text-align:center;border:1px dashed var(--state-warning);
        border-radius:var(--radius-sm);padding:var(--spacing-sm) var(--spacing-lg)}}
.exmiss b{{display:block;font-size:var(--text-xs);font-weight:var(--weight-strong);letter-spacing:.06em;
          text-transform:uppercase;color:var(--state-warning);margin-bottom:4px}}
.exmiss code{{font-size:var(--text-sm);color:var(--surface-fg-muted);background:none;padding:0}}
</style>
"""

# The wiring is identical on every card, so it lives here once rather than in 43 copies.
PAGE = """
function Page() {
  return <React.Fragment>
    <div dangerouslySetInnerHTML={{ __html: DOC }} />
    {EXAMPLES.length > 0 && (
      <section className="ex">
        <h2 className="exh">Live examples</h2>
        <div className="exgrid">
          {EXAMPLES.map((e) => {
            // A name the bundle does not export destructures to `undefined`, and rendering
            // <undefined/> throws "Element type is invalid" — which unmounts the WHOLE card,
            // write-up included, and leaves a black pane nobody notices until they open it.
            // So check first and draw a labelled placeholder instead. `node` is a thunk for
            // this reason: an eagerly-built element would already have logged the error.
            const miss = e.uses.filter((n) => !NS[n]);
            return (
              <div key={e.name}>
                <div className={'exlabel ' + e.role}><code>{e.name}</code></div>
                <div className="exbox">
                  {miss.length
                    ? <div className="exmiss">
                        <b>Component not loaded</b>
                        <code>{miss.join(', ')}</code>
                      </div>
                    : e.node()}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    )}
  </React.Fragment>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<Page />);
"""


def examples_for(created, extended):
    """(name, role, jsx) for this screen's own components, created first then extended.

    Deduplicated — a screen can list the same name under both — and a component with no
    snippet file drops out here, silently, rather than becoming a tag nothing defines."""
    out, seen = [], set()
    for name, role in [(c, "new") for c in created] + [(c, "ext") for c in extended]:
        if name in seen:
            continue
        seen.add(name)
        src = snippet(name)
        if src is not None:
            out.append((name, role, src))
    return out


def card(s):
    created = [c for c, _ in s["created"]]
    extended = [c for c, _, _ in s["extended"]]
    existing = [c for c, _ in s["existing"]]
    subtitle = "%s — %d new, %d extended, %d already present" % (
        s["source"].rstrip("."), len(created), len(extended), len(existing))

    ex = examples_for(created, extended)
    rows = -(-len(ex) // EX_COLS)
    height = TOP
    if rows:
        height += EX_HEAD + rows * EX_ROW + (rows - 1) * EX_GAP + EX_PAD

    parts = [HEAD.format(vp="1180x%d" % height, cdn=CDN, cols=EX_COLS, box=EX_BOX,
                         gap=EX_GAP, pt=EX_PAD, pb=EX_PAD,
                         name=attr("%s · %s" % (s["id"], s["title"])),
                         subtitle=attr(subtitle))]

    # The documentation half is plain HTML and stays plain HTML: it is handed to React as
    # one innerHTML blob out of a <template>, so nothing here has to be rewritten as JSX.
    parts.append('<template id="__doc">')
    parts.append('<div class="wrap">')
    parts.append('<img class="shot" src="../assets/reference/spotify/%s.jpg" alt="%s">'
                 % (s["id"], attr(s["title"])))
    parts.append('<div class="col">')
    parts.append("<h1>%s — %s</h1>" % (s["id"], inline(s["title"])))
    parts.append('<p class="src">%s</p>' % inline(s["source"]))

    parts.append("<h2>Affordances observed</h2><ul>")
    for o in s["observed"]:
        parts.append("<li>%s</li>" % inline(o))
    parts.append("</ul>")

    parts.append("<h2>Components</h2>")
    def line(tag, names, cls):
        if not names:
            return '<div class="row"><span class="tag">%s</span><span class="none">none</span></div>' % tag
        return '<div class="row %s"><span class="tag">%s</span>%s</div>' % (
            cls, tag, " ".join("<code>%s</code>" % html.escape(n) for n in names))
    parts.append(line("Created", created, "new"))
    parts.append(line("Extended", extended, "ext"))
    parts.append(line("Existing", existing, ""))

    if s["notbuilt"]:
        parts.append("<h2>Deliberately not built</h2><ul>")
        for n in s["notbuilt"]:
            parts.append("<li>%s</li>" % inline(n))
        parts.append("</ul>")

    parts.append("</div></div>")
    parts.append("</template>")
    parts.append('<div id="root"></div>')

    wanted = set()
    for _, _, src in ex:
        wanted |= needed(src)
    parts.append('<script type="text/babel">')
    # NS and the destructure both read window.<NAMESPACE> literally, on purpose. The
    # destructure is what docs/render_cards.mjs greps for to report "not in namespace" —
    # binding through NS instead would silence the only automated detector in the repo. The
    # `|| {}` keeps a wholly absent bundle from throwing on the very first line.
    parts.append("const NS = window.%s || {};" % NAMESPACE)
    parts.append("const { %s } = window.%s || {};" % (", ".join(sorted(wanted)), NAMESPACE))
    parts.append("const DOC = document.getElementById('__doc').innerHTML;")
    parts.append("const EXAMPLES = [")
    for name, role, src in ex:
        uses = ", ".join("'%s'" % n for n in sorted(needed(src) | ({name} & KNOWN)))
        parts.append("  { name: '%s', role: '%s', uses: [%s], node: () => (" % (name, role, uses))
        parts.append(src)
        parts.append("  ) },")
    parts.append("];")
    parts.append(PAGE.strip())
    parts.append("</script>\n")
    return "\n".join(parts)


INDEX_HEAD = """<!-- @dsCard group="Reference" viewport="{vp}" name="00 · Screenshot index" subtitle="All {n} source screenshots, and what each one produced" -->
<link rel="stylesheet" href="../styles.css">
<style id="__card-page-css">
html,body{{margin:0;background:var(--surface-bg);color:var(--surface-fg);font-family:var(--font-body)}}
.pad{{padding:var(--spacing-2xl)}}
h1{{font-family:var(--font-heading);font-weight:var(--weight-super-strong);font-size:var(--h3-size);margin:0 0 4px}}
p.lede{{color:var(--surface-fg-muted);font-size:var(--text-sm);margin:0 0 var(--spacing-lg);max-width:70ch}}
.cols{{column-count:2;column-gap:var(--spacing-2xl)}}
.r{{break-inside:avoid;font-size:var(--text-sm);line-height:1.45;margin-bottom:6px;
   padding-bottom:6px;border-bottom:1px solid var(--surface-border)}}
.id{{font-weight:var(--weight-strong);color:var(--accent-ink);margin-right:6px}}
.t{{font-weight:var(--weight-strong)}}
.m{{color:var(--surface-fg-muted)}}
</style>
"""


def index():
    rows = []
    for s in SCREENS:
        c, e = len(s["created"]), len(s["extended"])
        bits = []
        if c: bits.append("%d new" % c)
        if e: bits.append("%d extended" % e)
        if not bits: bits.append("nothing new")
        rows.append('<div class="r"><span class="id">%s</span><span class="t">%s</span>'
                    '<br><span class="m">%s</span></div>'
                    % (s["id"], inline(s["title"]), " · ".join(bits)))
    return (INDEX_HEAD.format(vp=INDEX_VIEWPORT, n=len(SCREENS))
            + '<div id="root"><div class="pad"><h1>Source screenshots</h1>'
            + '<p class="lede">The Spotify screens this design system was read from. Every card in '
              'this group pairs one screenshot with the affordances it produced, so the mapping can '
              'be checked against its source. Full write-ups live in <code>docs/screens/</code>.</p>'
            + '<div class="cols">' + "".join(rows) + "</div></div></div>\n")


def main():
    os.makedirs(OUT, exist_ok=True)
    for s in SCREENS:
        with open(os.path.join(OUT, "%s.card.html" % s["id"]), "w") as fh:
            fh.write(card(s))
    with open(os.path.join(OUT, "index.card.html"), "w") as fh:
        fh.write(index())
    print("wrote %d reference cards + index to reference/" % len(SCREENS))


if __name__ == "__main__":
    main()

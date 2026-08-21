#!/usr/bin/env python3
"""Generate the Reference card group: one card per source screenshot, plus an index.

The Design System pane's unit of display is a card, so "the screenshots and their
documentation" has to BE cards or it is invisible there. Each one pairs the original
screenshot with what that screen actually produced — so a reviewer can check the
affordance mapping against its source instead of taking it on trust.

Driven by the same SCREENS mapping that writes docs/screens/*.md, so the two cannot
drift. Plain HTML, no React: these are documentation, not component demos.

    python3 docs/gen_reference_cards.py
"""
import html
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from gen_screens import SCREENS  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "reference")

VIEWPORT = "1180x700"
INDEX_VIEWPORT = "1180x820"


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
<style id="__card-page-css">
html,body{{margin:0;background:var(--surface-bg);color:var(--surface-fg);font-family:var(--font-body)}}
.wrap{{display:flex;gap:var(--spacing-2xl);padding:var(--spacing-2xl);align-items:flex-start}}
.shot{{width:280px;flex-shrink:0;border-radius:var(--radius-sm);border:1px solid var(--surface-border);display:block}}
.col{{flex:1;min-width:0}}
h1{{font-family:var(--font-heading);font-weight:900;font-size:var(--h3-size);margin:0 0 4px}}
.src{{color:var(--surface-fg-muted);font-size:var(--text-sm);margin:0 0 var(--spacing-lg)}}
h2{{font-size:var(--text-xs);font-weight:700;letter-spacing:.09em;text-transform:uppercase;
   color:var(--surface-fg-muted);margin:var(--spacing-lg) 0 var(--spacing-sm)}}
ul{{margin:0;padding-left:1.1em}}
li{{font-size:var(--text-sm);line-height:1.5;margin-bottom:4px}}
code{{font-family:ui-monospace,monospace;font-size:.92em;background:var(--surface-card);
     padding:1px 5px;border-radius:var(--radius-xs)}}
.row{{font-size:var(--text-sm);line-height:1.6;margin-bottom:2px}}
.tag{{display:inline-block;min-width:78px;font-weight:700;font-size:var(--text-xs);
     text-transform:uppercase;letter-spacing:.06em;color:var(--surface-fg-muted)}}
.new code{{color:var(--accent-ink)}}
.ext code{{color:var(--state-warning)}}
.none{{color:var(--surface-fg-muted);font-size:var(--text-sm)}}
</style>
"""


def card(s):
    created = [c for c, _ in s["created"]]
    extended = [c for c, _, _ in s["extended"]]
    existing = [c for c, _ in s["existing"]]
    subtitle = "%s — %d new, %d extended, %d already present" % (
        s["source"].rstrip("."), len(created), len(extended), len(existing))

    parts = [HEAD.format(vp=VIEWPORT, name=attr("%s · %s" % (s["id"], s["title"])),
                         subtitle=attr(subtitle))]
    parts.append('<div id="root"><div class="wrap">')
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

    parts.append("</div></div></div>\n")
    return "\n".join(parts)


INDEX_HEAD = """<!-- @dsCard group="Reference" viewport="{vp}" name="00 · Screenshot index" subtitle="All {n} source screenshots, and what each one produced" -->
<link rel="stylesheet" href="../styles.css">
<style id="__card-page-css">
html,body{{margin:0;background:var(--surface-bg);color:var(--surface-fg);font-family:var(--font-body)}}
.pad{{padding:var(--spacing-2xl)}}
h1{{font-family:var(--font-heading);font-weight:900;font-size:var(--h3-size);margin:0 0 4px}}
p.lede{{color:var(--surface-fg-muted);font-size:var(--text-sm);margin:0 0 var(--spacing-lg);max-width:70ch}}
.cols{{column-count:2;column-gap:var(--spacing-2xl)}}
.r{{break-inside:avoid;font-size:var(--text-sm);line-height:1.45;margin-bottom:6px;
   padding-bottom:6px;border-bottom:1px solid var(--surface-border)}}
.id{{font-weight:700;color:var(--accent-ink);margin-right:6px}}
.t{{font-weight:700}}
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

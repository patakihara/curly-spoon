#!/usr/bin/env python3
"""Build one local HTML page that reproduces Claude Design's own "Design System" pane
pixel-perfectly: the real captured DOM/class structure (see .claude-design-vendor/page.html,
a browser capture of the live panel) linked against the real vendored CSS, with Sonora's own
_ds_manifest.json data slotted into the matching real-DOM slots and each card previewed as a
live `<iframe>` onto its own file (render_cards.mjs's screenshots are only a fallback now — see
preview_mount()). Nothing here is pushed — it's a local index for browsing the mirror.

Only the panel itself is reproduced (nav + content pane), not Claude Design's surrounding app
chrome (#root, sidebar, toolbar) — that's out of scope, and gallery.html supplies its own
minimal plumbing (a full-height flex ancestor) for the panel's own `h-full` to resolve against.
Two content pieces the real panel has no local equivalent for are dropped entirely: the
publish-settings card (live workspace/account state, no manifest field) and the h1's thumbnail-
upload button (an uploaded image with no local backend to serve one).

The Edit button is live: it opens the visual property editor (docs/gallery.js and docs/gallery.css,
which the page links but does not depend on — with JS off it is still the static, pixel-faithful
panel every measurement in this docstring was taken against, and the markup emitted below is still
the captured markup; the script attaches by om-ds-* hook classes rather than rewriting any captured
class). Still inert, for want of anything local to connect them to: "Add usage notes", and
group-header expand/collapse.

Card previews are live `<iframe src="...">`s onto the card's own file (see preview_mount()), not
screenshots — matching what the real capture turned out to actually be (an iframe at native card
size, CSS `transform:scale()`d down), which corrects an earlier wrong guess in this file that
called that treatment "a real unknown" and used object-fit:cover on a screenshot instead. One real
divergence from the real mechanism remains, deliberately: our iframe lays out at the preview box's
own ~728px width, not the card's declared manifest viewport width (the real transform:scale()
approach renders at native width first and shrinks the whole rendered result, so it never faces
this tradeoff). A card whose layout assumes something close to its full declared width can overflow
horizontally at 728px in a way it never would there. What overflows is still reachable, not lost —
the iframe scrolls there on hover the same way S02's vertical overflow does (see review_card()) —
which is the actual point of an iframe over a screenshot.
Previews also now depend on the network at view time (the CDN-hosted React/ReactDOM/Babel every
card pulls in) — no such dependency existed for a screenshot.

One-time setup before the first run (not needed on every run): the 4 CSS files and 5 font files
under .claude-design-vendor/ must already be vendored, and index-CrWB6CHH.css's @font-face rules
must already point at the local font files rather than assets-proxy.anthropic.com. If gallery.html
renders with a system/serif fallback font or with tofu icon glyphs, that setup is what's missing —
this script does not fetch or rewrite anything itself.

Needs docs/build_bundle.js run at least once regardless: cards preview live now, and every card
pulls in ../../_ds_bundle.js itself (that's what a card's own script tag resolves to), so a stale
or missing bundle now breaks what you SEE in gallery.html, not just what render_cards.mjs reports.
Running render_cards.mjs too is no longer required for gallery.html itself, but still worth doing —
it's the only thing that checks for a broken card (blank #root, a console error, a bad destructure
off the namespace), which a live iframe here will otherwise just render as an empty box with no
diagnostic. Its docs/.render/*.png output now only backs the dev-facing fallback for a card whose
own path doesn't resolve to a real file (see preview_mount()) — keyed by each card's full relative
path with '/' replaced by '_' (matching render_cards.mjs's own output naming), not by basename, so
two cards in different folders sharing a basename each resolve to their own screenshot.

    node docs/build_bundle.js && node docs/render_cards.mjs && python3 docs/gen_gallery.py

Serve gallery.html over a local HTTP server rather than opening it via file:// — Chromium's
webfont loading under file:// is unreliable, and a failure there is silent (fonts just fall back).
Verified against the real app at a browser window of 1440x900; the panel's own
[container-type:inline-size] nav-hide rule depends on window width minus this mirror's (thin)
chrome, not Claude Design's own (thicker) chrome, so nav visibility/gutters are only guaranteed
to match the real app at that specific width, not at arbitrary sizes.
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def slugify(s):
    # Group names only ("App Screens" -> "app-screens") — good enough since groups are a short,
    # human-picked, ASCII set (see the sorted() list in main()). Card ids use the manifest path
    # sanitized the same way render_cards.mjs/png_for() already key screenshots (see there), not
    # this — a card path is already unique and filesystem-safe, slugifying it further would just
    # be a second naming scheme for the same thing.
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')


def md_to_html(src):
    """Just enough Markdown for this repo's own docs: headings, bold, links, lists, code
    spans, paragraphs. Not CommonMark — there is no external renderer available offline,
    and the source files here don't use anything beyond this.

    List items emit <li><p>...</p></li>, not bare <li>...</li>: the real README block is a
    ProseMirror instance whose DOM nests list-item text in a <p> (confirmed against both the
    captured page.html and PromptMdEditor-DTc_sH_1.css's own `li>p{margin:0}` rule, which has
    nothing to target otherwise). Visually identical either way under that rule, but shape-
    fidelity is the point of this rewrite. Same reasoning for `<ul data-tight="true">`: the real
    capture carries that attribute on every list, and no vendored stylesheet has a selector
    referencing it (grepped all four — nothing), so it's cosmetically inert here too, but cheap
    to match exactly rather than silently drop."""
    out, para, in_list = [], [], False

    def flush_para():
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>')
            para.clear()

    def close_list():
        nonlocal in_list
        if in_list:
            out.append('</ul>')
            in_list = False

    def inline(s):
        s = html.escape(s)
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
        s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
        return s

    for line in src.splitlines():
        m = re.match(r'^(#{1,6})\s+(.*)', line)
        if m:
            flush_para(); close_list()
            level = len(m.group(1))
            out.append(f'<h{level}>{inline(m.group(2))}</h{level}>')
            continue
        m = re.match(r'^[-*]\s+(.*)', line)
        if m:
            flush_para()
            if not in_list:
                out.append('<ul data-tight="true">'); in_list = True
            out.append('<li><p>' + inline(m.group(1)) + '</p></li>')
            continue
        if not line.strip():
            flush_para(); close_list()
            continue
        para.append(line.strip())
    flush_para(); close_list()
    # Joined with NO separator, not '\n' — this HTML lands inside .om-prompt-md .ProseMirror,
    # which PromptMdEditor-DTc_sH_1.css sets to `white-space:pre-wrap` (so the editor preserves
    # a user's own blank lines as typed). A joining '\n' is therefore not inert whitespace the
    # way it would be in a normal block context: pre-wrap renders it as a real line break, adding
    # a blank line's worth of height *and* feeding non-empty "content" between adjacent blocks
    # that would otherwise margin-collapse, doubling their gap on top of that. Confirmed against
    # the real capture (page.html): its own ProseMirror serializer emits every block flush against
    # the next with zero whitespace between them, e.g. `<h1>...</h1><p>...` with no newline.
    return ''.join(out)


def png_for(card_path):
    # Keyed by the card's full relative path (slashes -> underscores), matching render_cards.mjs's
    # own `rel.replace(/\//g, '_') + '.png'` naming exactly — NOT os.path.basename(card_path). Two
    # cards in different folders can share a basename; keying by full path lets both resolve to
    # their own screenshot.
    slug = card_path.replace('/', '_')
    p = os.path.join(ROOT, '.render', slug + '.png')
    return p if os.path.exists(p) else None


def preview_height(card):
    # Reverse-engineered from the real captured panel (page.html): matched 83/84 real cards
    # exactly, joining on card title against _ds_manifest.json's own viewport field. The one
    # mismatch is explained by a stale card name in that snapshot, not a formula failure — see
    # the plan's risks for the full account. Not derived from any documented Claude Design
    # behavior, so a future app change could silently drift this cap out of sync.
    return min(int(card['viewport'].split('x')[1]), 500)


def preview_mount(card, png):
    """The real DOM's two-level preview wrapper (outer bg-elevated box, inner bg-surface box
    carrying the iframe-hover classes, innermost sized div) — restored verbatim rather than
    flattened, for DOM-shape fidelity. Those iframe-hover classes turn out not to be vestigial:
    the real capture's own equivalent slot IS a live `<iframe src="...">` (924x540, CSS
    `transform:scale()`d down to fit) — not an object-fit:cover screenshot, so that was a wrong
    guess in the original pixel-fidelity pass. Card previews now do the same: an iframe onto the
    card's own file, not a picture of one.

    The real iframe also carries `inert` + `aria-hidden="true"` at rest, presumably lifted by app
    JS on hover/focus — we drop both rather than copy them inert, since a permanently-inert iframe
    would defeat the entire point of this fix (genuinely interactable previews) and this page runs
    no JS to ever lift them. The `[&_iframe]:pointer-events-none [&:hover_iframe]:pointer-events-
    auto` classes already on this wrapper (kept verbatim from the capture) give the same "inert
    until you hover it" behavior with plain CSS instead. `aria-hidden` is kept only on the
    non-interactive fallback branches below (a screenshot or a placeholder is legitimately
    decorative; a live iframe is not — hiding interactive content from assistive tech is its own
    bug, not a fidelity choice)."""
    h = preview_height(card)
    src_path = os.path.join(ROOT, card['path'])
    if os.path.exists(src_path):
        # loading="lazy" is load-bearing, not cosmetic: 84 cards each independently bootstrap
        # React+ReactDOM+Babel and run a JSX transform on load. Native lazy-loading means an
        # offscreen card's iframe doesn't even start that work until scrolled near the viewport,
        # which is what keeps opening this page from booting all 84 at once.
        name = html.escape(card.get('name', card['path']))
        inner = (f'<iframe src="{html.escape(os.path.relpath(src_path, ROOT))}" loading="lazy" '
                  f'title="{name} preview" '
                  'style="width:100%;height:100%;border:0;display:block"></iframe>')
        hidden = ''
    elif png:
        # Only reachable if a manifest card's own path doesn't resolve to a real file — every
        # card's path does today, so this is a dev-facing safety net, not the common case.
        inner = (f'<img src="{html.escape(os.path.relpath(png, ROOT))}" alt="" '
                  'style="width:100%;height:100%;object-fit:cover;object-position:top;display:block">')
        hidden = ' aria-hidden="true"'
    else:
        # Dev-facing fallback, not a guess at the real app's state (which was never observed —
        # every real preview was captured empty). More useful for local dev than a silent blank box.
        inner = ('<div style="width:100%;height:100%;display:flex;align-items:center;'
                 'justify-content:center;text-align:center;font-size:11px;color:var(--om-text-tertiary)">'
                 'not rendered — run render_cards.mjs</div>')
        hidden = ' aria-hidden="true"'
    # om-ds-preview-mount is ours, not a captured class: docs/gallery.js needs one stable handle
    # per preview to reach its iframe (element picking), and docs/gallery.css hangs the pick-mode
    # outline on it. Additive only — it carries no styling at rest, so the captured classes
    # alongside it still decide every pixel.
    return f'''<div class="om-ds-preview-mount bg-om-bg-elevated border border-om-border-default rounded-[10px] shadow-om-sm overflow-hidden">
              <div class="bg-om-bg-surface relative [&_iframe]:pointer-events-none [&:hover_iframe]:pointer-events-auto">
                <div{hidden} style="height:{h}px">
                  {inner}
                </div>
              </div>
            </div>'''


def card_id(card_path):
    # Same slug render_cards.mjs/png_for() already use to key a screenshot ('/' -> '_'), prefixed
    # so it can't collide with a section id or anything else on the page sharing a bare slug.
    return 'card-' + card_path.replace('/', '_')


def review_card(card):
    png = png_for(card['path'])
    name = html.escape(card.get('name', card['path']))
    subtitle = html.escape(card.get('subtitle', ''))
    path = html.escape(card['path'])
    cid = html.escape(card_id(card['path']))
    return f'''<div id="{cid}" class="om-review-card [&amp;+.om-review-card]:mt-[26px]" data-testid="ds-review-card" data-card-path="{path}" data-card-name="{name}">
            <div class="flex items-center gap-3 mb-2.5">
              <div class="flex-1 min-w-0">
                <div class="text-[13.5px] font-[550] leading-[1.3] text-om-text-primary">{name}</div>
                <div class="text-xs leading-[1.4] text-om-text-tertiary mt-0.5">{subtitle}</div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <!-- Edit is live (docs/gallery.js): it opens the visual property editor, which
                     writes through the endpoints in docs/serve.py. At rest it is still the captured
                     markup, bar the dropped aria-disabled/tabindex="-1" pair that marked it inert
                     and an om-ds-* hook for the script. -->
                <button type="button" title="Edit {path}'s properties" class="om-ds-edit-btn relative inline-flex min-w-0 shrink cursor-default select-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap border font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 text-[11px] gap-1 rounded-md bg-om-bg-surface hover:bg-om-bg-hover active:bg-om-bg-active border-om-border-default text-om-text-primary shadow-om-xs">
                  <span class="inline-flex items-center gap-[inherit]"><i class="ai-ArrowUpRight leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:11px"></i>Edit</span>
                </button>
              </div>
            </div>

            {preview_mount(card, png)}

            <!-- Always the collapsed "Add usage notes" default state — the manifest has no notes
                 field for any card, so there is no data to render any card as "populated" with. -->
            <div><div class="flex items-center h-8 py-0.5">
              <button type="button" aria-disabled="true" tabindex="-1" class="relative inline-flex min-w-0 shrink cursor-default select-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap border border-transparent font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 text-[11px] gap-1 rounded-md bg-transparent text-om-text-secondary">
                <span class="inline-flex items-center gap-[inherit]">Add usage notes</span>
              </button>
            </div></div>
          </div>'''


def nav_group(group, cards):
    # <a href="#id">, not <button> — the real app jumps the content pane on click (via app JS we
    # don't have); a same-page anchor link is the JS-free equivalent, and the real classes already
    # neutralize an <a>'s usual look (index-CrWB6CHH.css: `a{color:inherit;text-decoration:none}`,
    # plus `cursor-default` here beating the base stylesheets' `a{cursor:pointer}` on specificity —
    # a class selector always outranks a bare-element one). The one thing NOT already neutralized:
    # three vendored files each carry `a:hover{text-decoration:underline}` at (0,1,1) specificity,
    # which these buttons never had to fight because a <button> was never a target of it. Handled
    # with one rule in this page's own <style> block rather than per-link, since it's the same fix
    # for every nav link — see `.om-ds-outline-aside a:hover` there.
    items = ''.join(
        f'''<a href="#{html.escape(card_id(c['path']))}" title="{html.escape(c.get('name', c['path']))}" class="w-full flex items-center gap-2 py-[5px] pr-2 pl-6 text-xs leading-[1.35] bg-transparent rounded-md cursor-default text-left transition-colors duration-100 hover:text-om-text-primary font-normal text-om-text-secondary">
              <span class="flex-[1_1_auto] min-w-0 truncate">{html.escape(c.get('name', c['path']))}</span>
            </a>'''
        for c in cards
    )
    return f'''<div class="mb-0.5">
          <a href="#{html.escape('section-' + slugify(group))}" aria-expanded="true" class="w-full flex items-center gap-1.5 py-1.5 px-2 text-xs font-[550] leading-snug text-om-text-secondary bg-transparent rounded-md cursor-default text-left transition-colors duration-100 hover:text-om-text-primary">
            <span class="inline-flex text-om-text-tertiary transition-transform duration-[120ms]"><i class="ai-CaretDownSmall leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:11px"></i></span>
            <span class="flex-[1_1_auto] min-w-0 truncate" title="{html.escape(group)}">{html.escape(group)}</span>
          </a>
          <div class="flex flex-col gap-px pt-0.5 pb-1.5">
            {items}
          </div>
        </div>'''


def main():
    manifest = json.load(open(os.path.join(ROOT, '_ds_manifest.json')))
    readme_path = os.path.join(ROOT, 'readme.md')
    readme_html = md_to_html(open(readme_path, encoding='utf-8').read()) if os.path.exists(readme_path) else ''

    by_group = {}
    for c in manifest['cards']:
        by_group.setdefault(c.get('group', 'Ungrouped'), []).append(c)
    # Alphabetical, NOT manifest array order — confirmed against the real captured page.html's own
    # nav/section order (App Screens, Brand, Colors, Components, Layout, Reference, Spacing, Type),
    # which does not match the manifest cards[] array's first-seen group order.
    groups = sorted(by_group)

    missing = [c['path'] for g in groups for c in by_group[g] if png_for(c['path']) is None]

    nav_html = ''.join(nav_group(g, by_group[g]) for g in groups)
    sections_html = ''.join(
        f'''<section id="{html.escape('section-' + slugify(g))}">
          <h2 class="m-0 mb-3.5 text-xs font-medium text-om-text-tertiary">{html.escape(g)}</h2>
          {''.join(review_card(c) for c in by_group[g])}
        </section>'''
        for g in groups
    )

    namespace = html.escape(manifest.get('namespace', 'Design System'))

    page = f'''<!doctype html><html data-theme="light"><head>
  <meta charset="utf-8">
  <title>{namespace} — local gallery</title>
  <link rel="stylesheet" href=".claude-design-vendor/index-CrWB6CHH.css">
  <link rel="stylesheet" href=".claude-design-vendor/FormList-DPI5FmbR.css">
  <link rel="stylesheet" href=".claude-design-vendor/PromptMdEditor-DTc_sH_1.css">
  <link rel="stylesheet" href=".claude-design-vendor/ProjectPage-D36IL5mP.css">
  <!-- Ours, last so it can win ties against the vendored files: the states the captured DOM has no
       markup for because they only exist while docs/gallery.js runs (the picker, the toast and the
       property editor). Nothing in it restyles a captured class at rest. -->
  <link rel="stylesheet" href="docs/gallery.css">
  <style>/* plumbing only, not app chrome: */
    html,body{{height:100%;margin:0}}
    body{{display:flex;flex-direction:column}} /* real body has no such rule, but the panel needs SOME
      ancestor supplying block height for its own h-full to resolve against, since every real ancestor
      (#root, .h-dvh.flex.flex-col, the toolbar and its siblings) is deliberately cut as app chrome. */
    .om-gallery-mount{{
      flex:1;min-height:0;
      /* No font-family here — this deliberately does NOT set Anthropic Sans. Verified against the
         real captured page.html: the --cds-font-sans custom property only resolves to Anthropic
         Sans on the .cds-root class rule, and in the real capture the design-system panel sits
         outside every .cds-root[data-font] element on the page (confirmed: none of them contain
         the panel), so it never receives that override — index-CrWB6CHH.css's own plain
         html-and-body font-family rule (a literal system-sans stack) is what the real panel's
         nav/card-title/subtitle/README text actually renders in, and that rule is already linked
         and applies here with no help needed. The h1 still matches separately via its own
         font-om-serif override, which takes precedence in both. */
    }}
    /* Nav jump targets (added functionality, see nav_group()/main()): the content pane
       ([data-testid="ds-pane"]) is the scrolling ancestor, and it has no fixed/sticky header to
       clear, but a jumped-to section or card landing exactly flush with its top edge still reads
       as jarring — a little breathing room either way is worth the one rule. */
    section[id], .om-review-card[id], #section-readme{{scroll-margin-top:16px}}
    /* The real classes already neutralize an <a>'s look everywhere else (see nav_group()'s own
       comment) except this: three vendored stylesheets each carry `a:hover{{text-decoration:
       underline}}` at (0,1,1) specificity, higher than a bare `.no-underline` utility class alone
       (0,1,0) would beat. `.om-ds-outline-aside a:hover` at (0,2,1) clears that regardless of
       stylesheet order. */
    .om-ds-outline-aside a:hover{{text-decoration:none}}
  </style>
</head><body>
<div class="om-gallery-mount">

  <!-- Panel outer container — real classes, verbatim. This div's own inline-size drives the
       @container(width<=1007px) nav-hide rule in ProjectPage-D36IL5mP.css; in the real app that
       size is the window minus Claude Design's own chrome, here it's the window minus only the
       scrollbar, so nav visibility/gutters are only verified to match at 1440x900 (see docstring). -->
  <div class="h-full flex min-h-0 [background:linear-gradient(to_bottom,var(--om-bg-surface),var(--om-bg-app))] [container-type:inline-size]">

    <nav aria-label="Design system outline" class="om-ds-outline-aside flex-[0_0_248px] min-w-0 flex-col overflow-hidden flex">
      <div class="flex-[1_1_auto] min-h-0 overflow-y-auto pt-[22px] px-2 pb-4">
        <div class="mb-1">
          <a href="#section-readme" title="Readme" class="w-full flex items-center gap-2 py-[5px] pr-2 pl-6 text-xs leading-[1.35] bg-transparent rounded-md cursor-default text-left transition-colors duration-100 hover:text-om-text-primary font-normal text-om-text-secondary">
            <span class="inline-flex text-om-text-tertiary ml-[-17px] mr-[-3px]"><i class="ai-BookText leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:13px"></i></span>
            <span class="flex-[1_1_auto] min-w-0 truncate">Readme</span>
          </a>
        </div>
        {nav_html}
      </div>
    </nav>

    <div data-testid="ds-pane" class="flex-[1_1_auto] min-w-0 overflow-y-auto">
      <div class="flex flex-col pt-[30px] px-4 pb-20 max-w-[760px] mx-auto" style="gap:24px">

        <div class="flex flex-col gap-2 px-1 items-stretch text-left">
          <div class="flex items-center gap-3.5">
            <h1 class="m-0 font-om-serif text-[24px] font-normal leading-tight tracking-[-0.2px] text-om-text-primary mb-0">{namespace}</h1>
          </div>
        </div>

        <!-- publish-settings card: omitted (live account/workspace state, no manifest equivalent) -->

        <div id="section-readme"><div>
          <div class="flex items-center h-8 py-0.5">
            <button class="inline-flex items-center gap-1.5 bg-transparent py-1 cursor-default text-xs font-medium text-om-text-tertiary hover:text-om-text-secondary">
              <i class="ai-CaretDown leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:10px"></i>Readme
            </button>
          </div>
          <div class="block">
            <div><div>
              <div translate="no" class="om-prompt-md relative rounded-lg [transition:background_0.15s_ease,box-shadow_0.15s_ease] cursor-text focus-within:bg-om-bg-elevated focus-within:shadow-[inset_0_0_0_1px_var(--om-border-default),var(--om-shadow-sm)]">
                <div translate="no" class="ProseMirror">{readme_html}</div>
              </div></div>
          </div>
        </div></div></div>

        {sections_html}

      </div>
    </div>
  </div>
</div>
<!-- defer, and last: the page is complete and correct without it (that is the point — every
     pixel-fidelity measurement in this file's docstring was taken with the panel static), so
     nothing here should block or reorder the render. -->
<script src="docs/gallery.js" defer></script>
</body></html>'''

    out_path = os.path.join(ROOT, 'gallery.html')
    open(out_path, 'w', encoding='utf-8').write(page)
    print(f'wrote {out_path} — {len(manifest["cards"])} cards across {len(groups)} groups' +
          (f', {len(missing)} missing a screenshot' if missing else ''))


if __name__ == '__main__':
    main()

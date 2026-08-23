#!/usr/bin/env python3
"""Build one local HTML page that reproduces Claude Design's own "Design System" pane
pixel-perfectly: the real captured DOM/class structure (see .claude-design-vendor/page.html,
a browser capture of the live panel) linked against the real vendored CSS, with Sonora's own
_ds_manifest.json data and render_cards.mjs's screenshots slotted into the matching real-DOM
slots. Nothing here is pushed — it's a local index for browsing the mirror.

Only the panel itself is reproduced (nav + content pane), not Claude Design's surrounding app
chrome (#root, sidebar, toolbar) — that's out of scope, and gallery.html supplies its own
minimal plumbing (a full-height flex ancestor) for the panel's own `h-full` to resolve against.
Two content pieces the real panel has no local equivalent for are dropped entirely: the
publish-settings card (live workspace/account state, no manifest field) and the h1's thumbnail-
upload button (an uploaded image with no local backend to serve one). Interactive-only elements
(Feedback/Edit/Add-usage-notes buttons, the feedback-collapse box, group-header expand/collapse)
are rendered with the real classes for pixel fidelity but are inert — no JS runs anywhere in this
page. See docs/../QUESTIONS.md or the implementation plan for the full set of documented gaps
(preview scale-vs-crop is a real unknown: every real card preview was captured empty, so the
object-fit:cover treatment here is a deterministic, defensible guess, not a verified match).

One-time setup before the first run (not needed on every run): the 4 CSS files and 5 font files
under .claude-design-vendor/ must already be vendored, and index-CrWB6CHH.css's @font-face rules
must already point at the local font files rather than assets-proxy.anthropic.com. If gallery.html
renders with a system/serif fallback font or with tofu icon glyphs, that setup is what's missing —
this script does not fetch or rewrite anything itself.

Requires docs/.render/*.png to exist — that's render_cards.mjs's own output, so run it first (it's
also how you'd notice a broken card, which this script does not check for). Screenshots are keyed
by each card's full relative path with '/' replaced by '_' (matching render_cards.mjs's own output
naming), not by basename, so ui_kits/desktop/index.html and ui_kits/mobile/index.html — which would
otherwise collide on the same basename 'index.html' — each resolve to their own screenshot.

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
    return '\n'.join(out)


def png_for(card_path):
    # Keyed by the card's full relative path (slashes -> underscores), matching render_cards.mjs's
    # own `rel.replace(/\//g, '_') + '.png'` naming exactly — NOT os.path.basename(card_path). Two
    # cards can share a basename (ui_kits/desktop/index.html and ui_kits/mobile/index.html both are
    # 'index.html'); keying by full path is what lets both resolve to their own screenshot.
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
    carrying the now-inert iframe-hover classes, innermost sized aria-hidden div) — restored
    verbatim rather than flattened, for DOM-shape fidelity, even though no iframe exists here."""
    h = preview_height(card)
    if png:
        inner = (f'<img src="{html.escape(os.path.relpath(png, ROOT))}" alt="" '
                  'style="width:100%;height:100%;object-fit:cover;object-position:top;display:block">')
    else:
        # Dev-facing fallback, not a guess at the real app's state (which was never observed —
        # every real preview was captured empty). More useful for local dev than a silent blank box.
        inner = ('<div style="width:100%;height:100%;display:flex;align-items:center;'
                 'justify-content:center;text-align:center;font-size:11px;color:var(--om-text-tertiary)">'
                 'not rendered — run render_cards.mjs</div>')
    return f'''<div class="bg-om-bg-elevated border border-om-border-default rounded-[10px] shadow-om-sm overflow-hidden">
              <div class="bg-om-bg-surface relative [&_iframe]:pointer-events-none [&:hover_iframe]:pointer-events-auto">
                <div aria-hidden="true" style="height:{h}px">
                  {inner}
                </div>
              </div>
            </div>'''


def review_card(card):
    png = png_for(card['path'])
    name = html.escape(card.get('name', card['path']))
    subtitle = html.escape(card.get('subtitle', ''))
    path = html.escape(card['path'])
    return f'''<div class="om-review-card [&amp;+.om-review-card]:mt-[26px]" data-testid="ds-review-card">
            <div class="flex items-center gap-3 mb-2.5">
              <div class="flex-1 min-w-0">
                <div class="text-[13.5px] font-[550] leading-[1.3] text-om-text-primary">{name}</div>
                <div class="text-xs leading-[1.4] text-om-text-tertiary mt-0.5">{subtitle}</div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <!-- Inert via aria-disabled+tabindex, never `disabled` (would trigger this stylesheet's
                     own .disabled\\:opacity-50:disabled rule and dim these against a full-opacity real
                     app) and never pointer-events:none (would kill the hover these title= tooltips need,
                     and is unnecessary — these are plain buttons with no onclick in this JS-free page). -->
                <span style="display:contents">
                  <button type="button" aria-disabled="true" tabindex="-1" title="Leave feedback (static mirror — inert)" class="relative inline-flex min-w-0 shrink cursor-default select-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap border font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 text-[11px] gap-1 rounded-md bg-om-bg-surface hover:bg-om-bg-hover active:bg-om-bg-active border-om-border-default text-om-text-primary shadow-om-xs">
                    <span class="inline-flex items-center gap-[inherit]">Feedback</span>
                  </button>
                </span>
                <button type="button" aria-disabled="true" tabindex="-1" title="{path}" class="relative inline-flex min-w-0 shrink cursor-default select-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap border font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 text-[11px] gap-1 rounded-md bg-om-bg-surface hover:bg-om-bg-hover active:bg-om-bg-active border-om-border-default text-om-text-primary shadow-om-xs">
                  <span class="inline-flex items-center gap-[inherit]"><i class="ai-ArrowUpRight leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:11px"></i>Edit</span>
                </button>
              </div>
            </div>

            <!-- Feedback-collapse box, at rest (grid-rows-[0fr], 0 visible height) — matches the real
                 default-closed state exactly, no JS needed. Only Submit keeps the real `disabled`
                 attribute (matching the real app's own empty-textarea state); its contents never render
                 since the box itself is grid-rows-[0fr]/opacity-0/invisible at rest. -->
            <div class="om-collapse grid [transition:grid-template-rows_var(--ms)_cubic-bezier(0.2,0,0,1)] grid-rows-[0fr] [&amp;&gt;div]:overflow-hidden [&amp;&gt;div]:[transition:opacity_var(--ms)_ease-out_var(--fade-delay),visibility_0s_linear_var(--vis-delay)] [&amp;&gt;div]:opacity-0 [&amp;&gt;div]:invisible" style="--ms:250ms;--fade-delay:0ms;--vis-delay:250ms">
              <div><div class="pb-3.5">
                <div class="om-ds-feedback-box mt-1.5 pt-2.5 px-2.5 pb-1 border border-om-border-subtle rounded-[10px] bg-om-bg-surface">
                  <textarea disabled placeholder="Describe what you'd prefer..." rows="2" class="w-full p-0 text-[13px] bg-transparent text-om-text-primary outline-none resize-none leading-normal overflow-y-hidden placeholder:text-om-text-tertiary om-max-700:text-base"></textarea>
                  <div class="om-actions flex gap-1" style="margin-top:6px;margin-bottom:6px;justify-content:flex-end">
                    <button title="Attach image (static mirror — inert)" class="flex cursor-default select-none items-center justify-center rounded-md p-0 text-om-text-secondary outline-none disabled:cursor-not-allowed disabled:opacity-30 bg-transparent border border-transparent" style="width:22px;height:22px;margin-right:auto"><i class="ai-Image leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:13px"></i></button>
                    <button class="relative inline-flex min-w-0 shrink cursor-default select-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap border font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 text-[11px] gap-1 rounded-md bg-om-bg-surface hover:bg-om-bg-hover active:bg-om-bg-active border-om-border-default text-om-text-primary shadow-om-xs">Cancel</button>
                    <button disabled class="relative inline-flex min-w-0 shrink cursor-default select-none items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap border font-medium outline-none disabled:cursor-not-allowed disabled:opacity-50 px-2 py-1 text-[11px] gap-1 rounded-md bg-om-accent-primary hover:bg-om-accent-primary-hover active:bg-om-accent-primary-active border-transparent text-om-text-inverse">Submit</button>
                  </div>
                </div>
              </div></div>
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
    items = ''.join(
        f'''<button type="button" title="{html.escape(c.get('name', c['path']))}" class="w-full flex items-center gap-2 py-[5px] pr-2 pl-6 text-xs leading-[1.35] bg-transparent rounded-md cursor-default text-left transition-colors duration-100 hover:text-om-text-primary font-normal text-om-text-secondary">
              <span class="flex-[1_1_auto] min-w-0 truncate">{html.escape(c.get('name', c['path']))}</span>
            </button>'''
        for c in cards
    )
    return f'''<div class="mb-0.5">
          <button type="button" aria-expanded="true" class="w-full flex items-center gap-1.5 py-1.5 px-2 text-xs font-[550] leading-snug text-om-text-secondary bg-transparent rounded-md cursor-default text-left transition-colors duration-100 hover:text-om-text-primary">
            <span class="inline-flex text-om-text-tertiary transition-transform duration-[120ms]"><i class="ai-CaretDownSmall leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:11px"></i></span>
            <span class="flex-[1_1_auto] min-w-0 truncate" title="{html.escape(group)}">{html.escape(group)}</span>
          </button>
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
        f'''<section>
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
          <button type="button" title="Readme" class="w-full flex items-center gap-2 py-[5px] pr-2 pl-6 text-xs leading-[1.35] bg-transparent rounded-md cursor-default text-left transition-colors duration-100 hover:text-om-text-primary font-normal text-om-text-secondary">
            <span class="inline-flex text-om-text-tertiary ml-[-17px] mr-[-3px]"><i class="ai-BookText leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:13px"></i></span>
            <span class="flex-[1_1_auto] min-w-0 truncate">Readme</span>
          </button>
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

        <div><div>
          <div class="flex items-center h-8 py-0.5">
            <button class="inline-flex items-center gap-1.5 bg-transparent py-1 cursor-default text-xs font-medium text-om-text-tertiary hover:text-om-text-secondary">
              <i class="ai-CaretDown leading-none not-italic w-[1em] h-[1em] inline-flex items-center justify-center shrink-0" style="font-size:10px"></i>Readme
            </button>
          </div>
          <div class="block">
            <div><div>
              <div translate="no" class="om-prompt-md relative rounded-lg [transition:background_0.15s_ease,box-shadow_0.15s_ease] cursor-text focus-within:bg-om-bg-elevated focus-within:shadow-[inset_0_0_0_1px_var(--om-border-default),var(--om-shadow-sm)]">
                <div translate="no" class="ProseMirror">
                  {readme_html}
                </div>
              </div></div>
          </div>
        </div></div></div>

        {sections_html}

      </div>
    </div>
  </div>
</div>
</body></html>'''

    out_path = os.path.join(ROOT, 'gallery.html')
    open(out_path, 'w', encoding='utf-8').write(page)
    print(f'wrote {out_path} — {len(manifest["cards"])} cards across {len(groups)} groups' +
          (f', {len(missing)} missing a screenshot' if missing else ''))


if __name__ == '__main__':
    main()

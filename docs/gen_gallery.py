#!/usr/bin/env python3
"""Build one local HTML page that replicates Claude Design's own "Design System" pane:
the README on top, then a section per manifest group listing every card's screenshot,
title, and subtitle. Nothing here is pushed — it's a local index for browsing the mirror.

Requires docs/.render/*.png to exist — that's render_cards.mjs's own output, so run it
first (it's also how you'd notice a broken card, which this script does not check for).

    node docs/build_bundle.js && node docs/render_cards.mjs && python3 docs/gen_gallery.py
    open gallery.html   # or: xdg-open, or just open it in VS Code's browser preview
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def md_to_html(src):
    """Just enough Markdown for this repo's own docs: headings, bold, links, lists, code
    spans, paragraphs. Not CommonMark — there is no external renderer available offline,
    and the source files here don't use anything beyond this."""
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
                out.append('<ul>'); in_list = True
            out.append('<li>' + inline(m.group(1)) + '</li>')
            continue
        if not line.strip():
            flush_para(); close_list()
            continue
        para.append(line.strip())
    flush_para(); close_list()
    return '\n'.join(out)


def png_for(card_path):
    # render_cards.mjs writes .render/<basename(path)>.png, basename only — flat, not nested.
    p = os.path.join(ROOT, '.render', os.path.basename(card_path) + '.png')
    return p if os.path.exists(p) else None


def main():
    manifest = json.load(open(os.path.join(ROOT, '_ds_manifest.json')))
    readme_path = os.path.join(ROOT, 'readme.md')
    readme_html = md_to_html(open(readme_path, encoding='utf-8').read()) if os.path.exists(readme_path) else ''

    groups, seen = [], set()
    for c in manifest['cards']:
        g = c.get('group', 'Ungrouped')
        if g not in seen:
            seen.add(g); groups.append(g)
    by_group = {g: [c for c in manifest['cards'] if c.get('group', 'Ungrouped') == g] for g in groups}

    missing = []
    sections = []
    for g in groups:
        cards = by_group[g]
        items = []
        for c in cards:
            png = png_for(c['path'])
            if png is None:
                missing.append(c['path'])
            thumb = (
                f'<img class="shot" src="file://{png}" alt="">' if png
                else '<div class="shot noshot">not rendered<br>run render_cards.mjs</div>'
            )
            items.append(f'''
<a class="card" href="file://{os.path.join(ROOT, c['path'])}" title="{html.escape(c['path'])}">
  {thumb}
  <div class="meta">
    <div class="name">{html.escape(c.get('name', c['path']))}</div>
    <div class="sub">{html.escape(c.get('subtitle', ''))}</div>
  </div>
</a>''')
        sections.append(f'''
<section>
  <h2>{html.escape(g)} <span class="count">{len(cards)}</span></h2>
  <div class="grid">{''.join(items)}</div>
</section>''')

    page = f'''<!doctype html><html><head><meta charset="utf-8">
<title>{html.escape(manifest.get('namespace', 'Design System'))} — local gallery</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: -apple-system, 'Segoe UI', sans-serif; max-width: 1200px; margin: 0 auto;
          padding: 40px 24px 120px; line-height: 1.55; }}
  h1 {{ font-size: 2rem; }}
  h2 {{ margin-top: 48px; border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
        padding-bottom: 8px; }}
  .count {{ font-weight: 400; opacity: .5; font-size: .8em; }}
  code {{ background: color-mix(in srgb, currentColor 8%, transparent); padding: 1px 5px; border-radius: 4px; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; margin-top: 16px; }}
  .card {{ display: block; text-decoration: none; color: inherit; border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
           border-radius: 10px; overflow: hidden; transition: border-color .15s; }}
  .card:hover {{ border-color: color-mix(in srgb, currentColor 40%, transparent); }}
  .shot {{ width: 100%; height: 150px; object-fit: cover; object-position: top; display: block;
           background: color-mix(in srgb, currentColor 6%, transparent); }}
  .shot.noshot {{ display: flex; align-items: center; justify-content: center; text-align: center;
                  font-size: .8em; opacity: .5; padding: 8px; }}
  .meta {{ padding: 10px 12px; }}
  .name {{ font-weight: 600; font-size: .92rem; }}
  .sub {{ font-size: .82rem; opacity: .65; margin-top: 2px; }}
  .missing {{ margin-top: 40px; padding: 16px; border: 1px dashed color-mix(in srgb, currentColor 30%, transparent);
              border-radius: 8px; font-size: .85rem; opacity: .8; }}
</style></head><body>
{readme_html}
{''.join(sections)}
{f'<div class="missing"><strong>{len(missing)} card(s) have no screenshot yet</strong> — run <code>node docs/render_cards.mjs</code> to generate them:<ul>' + ''.join(f'<li><code>{html.escape(p)}</code></li>' for p in missing) + '</ul></div>' if missing else ''}
</body></html>'''

    out_path = os.path.join(ROOT, 'gallery.html')
    open(out_path, 'w', encoding='utf-8').write(page)
    print(f'wrote {out_path} — {len(manifest["cards"])} cards across {len(groups)} groups' +
          (f', {len(missing)} missing a screenshot' if missing else ''))


if __name__ == '__main__':
    main()

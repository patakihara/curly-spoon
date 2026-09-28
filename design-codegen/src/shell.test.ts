import { describe, expect, it } from 'vitest';
import { REPO_ROOT, APP_DIR } from './outputs.js';
import { readNav, type NavPage } from './nav.js';
import { parsePage, type PageTree, type PropValue } from './page.js';
import {
  chrome,
  framePage,
  framed,
  layoutAt,
  layoutId,
  readShell,
  shellData,
  type ShellFile,
} from './shell.js';
import { readFileSync, readdirSync } from 'node:fs';
import { elements } from './test-pages.js';
import { join } from 'node:path';

const appDir = join(REPO_ROOT, APP_DIR);
const nav = readNav(appDir);
const shell = readShell(appDir);
const data = shellData(nav, shell);
const platformed = new Set(['BackLayer', 'MiniPlayer']);
const pageOf = (id: string): NavPage => nav.pages.find((p) => p.id === id)!;

const el = (tree: PageTree | undefined, component: string) => {
  expect(tree?.kind === 'element' && tree.component).toBe(component);
  return tree as Extract<PageTree, { kind: 'element' }>;
};
const pathOf = (value: PropValue | undefined) =>
  value?.kind === 'binding' ? value.path.join('.') : undefined;
/** What a `shell.…` binding resolves to in the shell's data. */
const resolve = (path: string) =>
  path
    .split('.')
    .slice(1)
    .reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], data);
const keys = (value: PropValue | undefined) =>
  (resolve(pathOf(value)!) as { key: string }[]).map((i) => i.key);

function components(tree: PageTree | undefined, into: string[] = []): string[] {
  if (tree === undefined) return into;
  if (tree.kind === 'element') {
    into.push(tree.component);
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') components(v.tree, into);
  }
  if ('children' in tree) tree.children.forEach((c) => components(c, into));
  return into;
}

describe('the app shell', () => {
  it('[M0.canvas] leaves a bare page its heading alone, a top app bar on the phone, with no navigation, player, panel or account', () => {
    for (const id of ['signIn', 'setup']) {
      for (const layout of nav.layouts) {
        const parts = chrome(nav, shell, pageOf(id), layout, platformed);
        expect(parts.appBar, `${id} ${layout.nav}`).toBe(layout.nav === 'bottomBar');
        for (const key of ['rail', 'leading', 'player', 'sheet'] as const)
          expect(parts[key], `${id} ${layout.nav} ${key}`).toBeUndefined();
        expect(parts.sheetOpen).toBe(false);
      }
    }
  });

  it('[M0.canvas] orders each layout’s destinations as nav.json does: Search last on the bottom bar, first on the rails', () => {
    for (const layout of nav.layouts) {
      const parts = chrome(nav, shell, pageOf('browse'), layout, platformed);
      const bar =
        layout.nav === 'bottomBar'
          ? el(
              parts.player?.kind === 'fragment' ? parts.player.children.at(-1) : parts.player,
              'BottomNav',
            )
          : el(parts.rail, 'NavRail');
      expect(keys(bar.props.items), layoutId(layout)).toEqual(layout.order);
    }
    expect(nav.layouts[0]!.order.at(-1)).toBe('search');
    for (const layout of nav.layouts.slice(1)) expect(layout.order[0]).toBe('search');
  });

  it('[M0.canvas] draws a bottom bar under 600 px, an icon rail from 600, a labelled rail from 1024 and the Now Playing panel from 1240', () => {
    const at = (width: number) =>
      chrome(nav, shell, pageOf('browse'), layoutAt(nav, width), platformed);
    expect(at(390).rail).toBeUndefined();
    expect(at(390).platform).toBe('mobile');
    expect(el(at(800).rail, 'NavRail').props.expanded).toEqual({ kind: 'literal', value: false });
    expect(el(at(1100).rail, 'NavRail').props.expanded).toEqual({ kind: 'literal', value: true });
    expect(at(1100).sheet).toBeUndefined();
    expect(el(at(1440).sheet, 'NowPlaying').props.open).toEqual({ kind: 'literal', value: true });
    expect(el(at(1440).sheet, 'NowPlaying').props.tab).toEqual({ kind: 'literal', value: 'now' });
    expect(at(1440).sheetOpen).toBe(true);
  });

  it('[M0.canvas] gives every rail the hamburger that collapses the labelled rail to the icon rail and back', () => {
    for (const layout of nav.layouts.filter((l) => l.nav !== 'bottomBar')) {
      for (const page of nav.pages.filter((p) => p.presentation !== 'bare')) {
        const rail = el(chrome(nav, shell, page, layout, platformed).rail, 'NavRail');
        expect(rail.props.toggle, `${page.id} at ${layoutId(layout)}`).toEqual({
          kind: 'literal',
          value: true,
        });
      }
    }
  });

  it('[M0.canvas] shows a page that is not a destination under a top app bar on the phone, never the backdrop’s back layer', () => {
    const destinations = new Set(nav.destinations.map((d) => d.id));
    const phone = layoutAt(nav, 390);
    const details = nav.pages.filter((p) => !destinations.has(p.id));
    expect(details.map((p) => p.id)).toEqual(
      expect.arrayContaining(['shelf', 'requests', 'album', 'artist', 'playlist', 'favourites']),
    );
    for (const page of nav.pages) {
      const parts = chrome(nav, shell, page, phone, platformed);
      expect(parts.appBar, page.id).toBe(!destinations.has(page.id));
      const root = el(
        framed(framePage({ kind: 'fragment', children: [] }), page.title, {
          appBar: { kind: 'literal', value: parts.appBar },
        }),
        'BackdropShell',
      );
      expect(root.props.appBar, page.id).toEqual({ kind: 'literal', value: parts.appBar });
    }
  });

  it('[M0.canvas] keeps a page that is not a destination in its destination’s backdrop on desktop, its rail item lit', () => {
    for (const layout of nav.layouts.filter((l) => l.nav !== 'bottomBar')) {
      for (const id of ['shelf', 'requests', 'album', 'artist']) {
        const parts = chrome(nav, shell, pageOf(id), layout, platformed);
        expect(parts.appBar, id).toBe(false);
        expect(el(parts.rail, 'NavRail').props.active).toEqual({
          kind: 'literal',
          value: pageOf(id).lights,
        });
      }
    }
    expect(pageOf('shelf').lights).toBe('browse');
    expect(pageOf('requests').lights).toBe('browse');
  });

  it('[M0.canvas] lights the page’s destination, and Settings at the rail’s foot', () => {
    const rail = (id: string) =>
      el(chrome(nav, shell, pageOf(id), layoutAt(nav, 1440), platformed).rail, 'NavRail');
    expect(rail('browse').props.active).toEqual({ kind: 'literal', value: 'browse' });
    expect(rail('settings').props.active).toEqual({ kind: 'literal', value: 'settings' });
    expect(keys(rail('settings').props.footerItems)).toEqual(['settings']);
  });

  it('[M0.canvas] shows the mini-player at every width once something is loaded, and none when nothing is', () => {
    for (const layout of nav.layouts) {
      expect(components(chrome(nav, shell, pageOf('browse'), layout, platformed).player)).toContain(
        'MiniPlayer',
      );
      const idle: ShellFile = { ...shell, playing: null };
      const parts = chrome(nav, idle, pageOf('browse'), layout, platformed);
      expect(components(parts.player)).not.toContain('MiniPlayer');
      expect(parts.sheet).toBeUndefined();
    }
  });

  it('[M0.canvas] leads the phone’s top bar with the account avatar on a destination home, and a close control on a page that closes', () => {
    const phone = layoutAt(nav, 390);
    expect(
      el(chrome(nav, shell, pageOf('browse'), phone, platformed).leading, 'AccountButton'),
    ).toBeTruthy();
    const close = el(
      chrome(nav, shell, pageOf('settings'), phone, platformed).leading,
      'IconButton',
    );
    expect(close.props.icon).toEqual({ kind: 'literal', value: 'close' });
    expect(
      chrome(nav, shell, pageOf('browse'), layoutAt(nav, 1440), platformed).leading,
    ).toBeUndefined();
  });

  it('[M0.canvas] puts the account avatar only where it leads the top bar, never in the rail, player or panel', () => {
    for (const page of nav.pages) {
      for (const layout of nav.layouts) {
        const parts = chrome(nav, shell, page, layout, platformed);
        for (const part of [parts.rail, parts.player, parts.sheet]) {
          expect(components(part)).not.toContain('AccountButton');
        }
      }
    }
  });

  it('gives each tree its layout’s platform as a literal', () => {
    const parts = chrome(nav, shell, pageOf('browse'), layoutAt(nav, 1440), platformed);
    expect(el(parts.player, 'MiniPlayer').props.platform).toEqual({
      kind: 'literal',
      value: 'desktop',
    });
  });
});

describe('a filter', () => {
  it('[M0.canvas] gives Browse the choice All, Music, Podcasts, Books, labelled by the destinations', () => {
    expect(data.filters.browse).toEqual(['All', 'Music', 'Podcasts', 'Books']);
    const labels = new Map(nav.destinations.map((d) => [d.id, d.label]));
    expect(data.filters.browse!.slice(1)).toEqual(
      pageOf('browse').filter!.narrows.map((id) => labels.get(id)),
    );
  });

  it('[M0.canvas] is drawn on Browse from the destinations, never from the page’s own data', () => {
    const source = readFileSync(join(appDir, 'pages', 'browse.page.jsx'), 'utf8');
    const controls = el(framePage(parsePage(source, 'browse')).controls, 'ButtonGroup');
    expect(pathOf(controls.props.items)).toBe('shell.filters.browse');
    expect(controls.props.value).toEqual({ kind: 'literal', value: pageOf('browse').filter!.all });
  });
});

describe('a page in the shell', () => {
  const page = (body: string) =>
    parsePage(
      `export default function Browse({ data }) {\n  return (\n${body}\n  );\n}\n`,
      'browse',
    );

  it('gives only its back layer’s controls and trailing, its subheader and its content', () => {
    const frame = framePage(
      page(`<BackdropShell back={<BackLayer controls={<ButtonGroup items={data.f} />} />} subheader={<FrontLayerHeader spy />}>
  <PageBody />
</BackdropShell>`),
    );
    expect(el(frame.controls, 'ButtonGroup')).toBeTruthy();
    expect(el(frame.subheader, 'FrontLayerHeader')).toBeTruthy();
    expect(frame.content.map((c) => c.kind === 'element' && c.component)).toEqual(['PageBody']);
  });

  it('[M0.canvas] gives its back layer a local search, named by its placeholder, which the shell keeps', () => {
    const frame = framePage(
      page(`<BackdropShell back={<BackLayer search="Search your books and requests" />}>
  <PageBody />
</BackdropShell>`),
    );
    expect(frame.search).toBe('Search your books and requests');
    const shellTree = el(framed(frame, 'Books', {}), 'BackdropShell');
    const slot = shellTree.props.back;
    const back = el(slot?.kind === 'slot' ? slot.tree : undefined, 'BackLayer');
    expect(back.props.search).toEqual({ kind: 'literal', value: 'Search your books and requests' });
  });

  it('[M0.canvas] takes its heading from nav.json, unless the page binds one from its data', () => {
    const plain = framePage(page('<BackdropShell><PageBody /></BackdropShell>'));
    const bound = framePage(
      page('<BackdropShell back={<BackLayer title={data.title} />}><PageBody /></BackdropShell>'),
    );
    const heading = (frame: ReturnType<typeof framePage>) => {
      const slot = el(framed(frame, 'Shelf', {}), 'BackdropShell').props.back;
      return el(slot?.kind === 'slot' ? slot.tree : undefined, 'BackLayer').props.title;
    };
    expect(heading(plain)).toEqual({ kind: 'literal', value: 'Shelf' });
    expect(heading(bound)).toEqual({ kind: 'binding', path: ['data', 'title'] });
  });

  it('[M0.canvas] names a page by its subject when the page binds an eyebrow, art and roundness from its data', () => {
    const frame = framePage(
      page(
        '<BackdropShell back={<BackLayer title={data.subject} eyebrow={data.eyebrow} image={data.art} round={data.round} />}><PageBody /></BackdropShell>',
      ),
    );
    const slot = el(framed(frame, 'Shelf', {}), 'BackdropShell').props.back;
    const back = el(slot?.kind === 'slot' ? slot.tree : undefined, 'BackLayer');
    expect(back.props.eyebrow).toEqual({ kind: 'binding', path: ['data', 'eyebrow'] });
    expect(back.props.image).toEqual({ kind: 'binding', path: ['data', 'art'] });
    expect(back.props.round).toEqual({ kind: 'binding', path: ['data', 'round'] });
    for (const prop of ['eyebrow="More like"', 'image={shell.account.image}', 'round']) {
      expect(() =>
        framePage(page(`<BackdropShell back={<BackLayer ${prop} />}><PageBody /></BackdropShell>`)),
      ).toThrow(
        /BackLayer\.(eyebrow|image|round) names the page's subject; a page may only bind its own data\.…/,
      );
    }
  });

  it('[M0.canvas] never repeats a page’s heading in a header below it, on any page', () => {
    const drawn = readdirSync(join(appDir, 'pages')).map((f) => f.replace('.page.jsx', ''));
    const bound = (v: PropValue | undefined) =>
      v?.kind === 'binding' ? v.path.join('.') : undefined;
    for (const id of drawn) {
      const tree = parsePage(readFileSync(join(appDir, 'pages', `${id}.page.jsx`), 'utf8'), id);
      const frame = framePage(tree);
      const heading = [bound(frame.title), bound(frame.context?.eyebrow)].filter(
        (p): p is string => p !== undefined,
      );
      for (const content of frame.content) {
        for (const header of elements(content)) {
          for (const prop of ['title', 'eyebrow']) {
            const path = bound(header.props[prop]);
            if (path !== undefined)
              expect(heading, `${id}: ${header.component}.${prop}`).not.toContain(path);
          }
        }
      }
    }
  });

  it('[M0.canvas] refuses a heading written in the page, or bound to anything but its data', () => {
    for (const title of ['"Mine"', '{"Mine"}', '{shell.account.label}', '{<Badge />}', '{null}']) {
      expect(() =>
        framePage(
          page(`<BackdropShell back={<BackLayer title=${title} />}><PageBody /></BackdropShell>`),
        ),
      ).toThrow(/BackLayer.title is nav.json's page title; a page may only bind its own data.…/);
    }
  });

  it('[M0.canvas] refuses a local search given as anything but its placeholder text', () => {
    for (const search of ['{<SearchField />}', '{data.search}', '{42}', '{null}', '']) {
      expect(() =>
        framePage(
          page(
            `<BackdropShell back={<BackLayer search${search === '' ? '' : `=${search}`} />}><PageBody /></BackdropShell>`,
          ),
        ),
      ).toThrow(/BackLayer.search is the placeholder text, a string/);
    }
  });

  it('is its front layer’s content alone when its root is not the shell', () => {
    expect(framePage(page('<PageBody />')).content).toHaveLength(1);
  });

  it.each([
    [
      'the rail',
      '<BackdropShell rail={<NavRail />}><PageBody /></BackdropShell>',
      /BackdropShell.rail is the shell's/,
    ],
    [
      'the leading control',
      '<BackdropShell back={<BackLayer leading={<IconButton label="x" />} />}><PageBody /></BackdropShell>',
      /BackLayer.leading is the shell's/,
    ],
  ])('refuses to set %s, which the shell supplies', (_what, body, error) => {
    expect(() => framePage(page(body))).toThrow(error);
  });

  it('[M0.canvas] refuses the account avatar in a filter row, or anywhere a page draws it', () => {
    expect(() =>
      framePage(
        page(
          `<BackdropShell back={<BackLayer controls={<AccountButton />} />}><PageBody /></BackdropShell>`,
        ),
      ),
    ).toThrow(/line 3: the account avatar is the shell's.*never in a filter row/);
    expect(() => framePage(page('<PageBody><AccountButton /></PageBody>'))).toThrow(
      /account avatar/,
    );
  });
});

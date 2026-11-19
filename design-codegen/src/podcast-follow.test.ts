import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNav } from './nav.js';
import { APP_DIR, REPO_ROOT } from './outputs.js';
import { checkPage, parsePage, type PageTree, type PropValue } from './page.js';
import { elements, readPage, type Element } from './test-pages.js';

const web = (page: string) =>
  readFileSync(join(REPO_ROOT, `web/src/generated/pages/${page}.tsx`), 'utf8');
const android = (page: string) =>
  readFileSync(
    join(REPO_ROOT, `android/app/src/main/java/net/develivarr/auralis/generated/pages/${page}.kt`),
    'utf8',
  );

const slotted = (e: Element, prop: string): Element | undefined => {
  const v = e.props[prop];
  return v?.kind === 'slot' && v.tree.kind === 'element' ? v.tree : undefined;
};

/** Each `<Each>` in the tree, in document order. */
function eaches(tree: PageTree, into: Extract<PageTree, { kind: 'each' }>[] = []) {
  if (tree.kind === 'each') into.push(tree);
  if (tree.kind === 'element') {
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') eaches(v.tree, into);
  }
  if ('children' in tree) tree.children.forEach((c) => eaches(c, into));
  return into;
}

describe('[M3.podcasts] following a show from its subscribe control', () => {
  const nav = readNav(join(REPO_ROOT, APP_DIR));
  const handlers = new Map([
    ['FollowButton', new Set(['onChange'])],
    ['Button', new Set(['onClick'])],
  ]);
  const pages = new Map(nav.pages.map((p) => [p.id, []] as [string, string[]]));
  const errorsOf = (source: string) =>
    checkPage(
      parsePage(source, 'p'),
      { ref: 'a-show' },
      handlers,
      undefined,
      undefined,
      undefined,
      {
        pages,
        handlers,
      } as never,
    );
  const page = (element: string) => `export default function P({ data }) { return ${element}; }`;

  it('[M3.podcasts] takes the show it follows, bound from the data, and nothing else', () => {
    const tree = parsePage(page('<FollowButton onChange={<Follow ref={data.ref} />} />'), 'p');
    expect(tree.kind === 'element' && tree.props.onChange).toEqual({
      kind: 'follow',
      params: { ref: ['data', 'ref'] },
    } satisfies PropValue);
    expect(() =>
      parsePage(page('<FollowButton onChange={<Follow show={data.ref} />} />'), 'p'),
    ).toThrow(/Follow takes ref/);
    expect(() =>
      parsePage(page('<FollowButton onChange={<Follow ref="a-show" />} />'), 'p'),
    ).toThrow(/must be a data path/);
    expect(() => parsePage(page('<Section><Follow ref={data.ref} /></Section>'), 'p')).toThrow(
      /Follow goes in a handler prop/,
    );
  });

  it("[M3.podcasts] goes on a FollowButton's change and nowhere else", () => {
    expect(errorsOf(page('<FollowButton onChange={<Follow ref={data.ref} />} />'))).toEqual([]);
    expect(errorsOf(page('<Button onClick={<Follow ref={data.ref} />} />'))).toEqual([
      expect.stringContaining("Follow goes on a FollowButton's onChange"),
    ]);
  });

  it('[M3.podcasts] refuses a show that is not a non-empty string', () => {
    expect(errorsOf(page('<FollowButton onChange={<Follow ref={data.missing} />} />'))).not.toEqual(
      [],
    );
  });

  it('[M3.podcasts] the web hands the show and the next state to what the page is given', () => {
    expect(web('Show')).toContain('onChange={follow(data.ref)}');
    expect(web('Show')).toContain('const follow = useFollow();');
    expect(web('Show')).toContain("import { useFollow } from '../../follow';");
    expect(web('Search')).toContain('onChange={follow(follows.item)}');
  });

  it('[M3.podcasts] Android leaves it unbound until M5, so it draws disabled', () => {
    for (const page of ['ShowPage', 'SearchPage']) {
      const made = android(page);
      const at = made.indexOf('FollowButtonProps(');
      expect(at).toBeGreaterThan(-1);
      // The control's props, up to the platform and size each FollowButton ends with.
      expect(made.slice(at, made.indexOf('platform =', at))).not.toMatch(/onChange/);
    }
  });
});

describe("[M3.podcasts] a show's page", () => {
  const { tree } = readPage('show');

  it('[M3.podcasts] its subscribe control follows and unfollows the show', () => {
    const header = elements(tree).find((e) => e.component === 'MediaHeader')!;
    const button = slotted(header, 'actions')!;
    expect(button.component).toBe('FollowButton');
    expect(button.props.onChange).toEqual({ kind: 'follow', params: { ref: ['data', 'ref'] } });
  });
});

describe("[M3.podcasts] Search's podcast rows", () => {
  const { tree, data } = readPage('search');
  const outer = eaches(tree).find((e) => e.of.join('.') === 'data.outside.podcasts')!;
  const branch = (of: string) => eaches(outer).find((e) => e.of.join('.') === `${outer.as}.${of}`)!;
  const row = (of: string) => elements(branch(of)).find((e) => e.component === 'ResultRow')!;
  const shows = (data.outside as { podcasts: { asking: unknown[]; follows: unknown[] }[] })
    .podcasts;

  it('[M3.podcasts] a show the household lacks is requested from its Subscribe button', () => {
    const asking = branch('asking');
    const r = row('asking');
    expect(r.props.status).toEqual({ kind: 'binding', path: [asking.as, 'status'] });
    expect(r.props.tone).toEqual({ kind: 'binding', path: [asking.as, 'tone'] });
    expect(r.props.onClick).toBeUndefined();
    const button = slotted(r, 'trailing')!;
    expect(button.component).toBe('Button');
    expect(button.props.onClick).toEqual({
      kind: 'request',
      params: { ref: [asking.as, 'ref'] },
    });
    expect(web('Search')).toContain('onClick={askFor(asking.ref)}');
  });

  it('[M3.podcasts] a show the household holds opens its page and is followed in place', () => {
    const follows = branch('follows');
    const r = row('follows');
    expect(r.props.onClick).toEqual({
      kind: 'open',
      page: 'show',
      params: { ref: [follows.as, 'item'] },
    });
    const button = slotted(r, 'trailing')!;
    expect(button.component).toBe('FollowButton');
    expect(button.props.size).toEqual({ kind: 'literal', value: 'sm' });
    expect(button.props.onChange).toEqual({
      kind: 'follow',
      params: { ref: [follows.as, 'item'] },
    });
  });

  it('[M3.podcasts] the canvas draws one show outside and one held', () => {
    expect(shows.flatMap((s) => s.asking)).toHaveLength(1);
    expect(shows.flatMap((s) => s.follows)).toHaveLength(1);
  });
});

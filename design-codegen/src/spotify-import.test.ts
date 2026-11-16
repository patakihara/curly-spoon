import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './outputs.js';
import { parsePage, type PageTree, type PropValue } from './page.js';
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

/** Each `<Each>` in the tree with the elements inside it, in document order. */
function eaches(tree: PageTree, into: Extract<PageTree, { kind: 'each' }>[] = []) {
  if (tree.kind === 'each') into.push(tree);
  if (tree.kind === 'element') {
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') eaches(v.tree, into);
  }
  if ('children' in tree) tree.children.forEach((c) => eaches(c, into));
  return into;
}

const sections = (tree: PageTree) => elements(tree).filter((e) => e.component === 'Section');
const titleOf = (e: Element) => {
  const t = e.props.title;
  return t?.kind === 'literal' ? t.value : undefined;
};

describe('[M3.spotify] importing a Spotify playlist from a control', () => {
  const page = (handler: string) =>
    `export default function P({ data }) { return <Button ${handler}>Import</Button>; }`;

  it('[M3.spotify] takes the link it imports, bound from the data, and nothing else', () => {
    const tree = parsePage(page('onClick={<Import from={data.from} />}'), 'p');
    expect(tree.kind === 'element' && tree.props.onClick).toEqual({
      kind: 'import',
      params: { from: ['data', 'from'] },
    } satisfies PropValue);
    expect(() => parsePage(page('onClick={<Import ref={data.from} />}'), 'p')).toThrow(
      /Import takes from/,
    );
    expect(() => parsePage(page('onClick={<Import from="https://x" />}'), 'p')).toThrow(
      /must be a data path/,
    );
    expect(() =>
      parsePage(
        'export default function P({ data }) { return <Section><Import from={data.from} /></Section>; }',
        'p',
      ),
    ).toThrow(/Import goes in a handler prop/);
  });

  it('[M3.spotify] the web hands the link to what the page is given', () => {
    const made = web('Search');
    expect(made).toContain('onClick={importFrom(playlist.from)}');
    expect(made).toContain('const importFrom = useImport();');
    expect(made).toContain("import { useImport } from '../../import';");
  });

  it('[M3.spotify] Android leaves it unbound until M5, so it draws disabled', () => {
    expect(android('SearchPage')).not.toMatch(/import\(|importFrom|onImport/i);
  });
});

describe("[M3.spotify] Search's pasted playlist row", () => {
  const { tree, data } = readPage('search');

  it('sits after the top result, a Spotify playlist with its song count and an Import button', () => {
    const order = sections(tree).map((s) => titleOf(s));
    const each = eaches(tree).find((e) => e.of.join('.') === 'data.outside.playlist')!;
    expect(each).toBeDefined();
    const all = elements(tree);
    const top = all.findIndex((e) => e.component === 'Section' && titleOf(e) === 'Top result');
    const row = elements(each).find((e) => e.component === 'ResultRow')!;
    expect(all.indexOf(row)).toBeGreaterThan(top);
    expect(all.indexOf(row)).toBeLessThan(
      all.findIndex((e) => e.component === 'Section' && titleOf(e) === 'In your library'),
    );
    expect(order).toContain('Top result');
    const button = slotted(row, 'trailing')!;
    expect(button.component).toBe('Button');
    expect(button.props.onClick).toEqual({
      kind: 'import',
      params: { from: [each.as, 'from'] },
    });
    const playlists = (data.outside as { playlist: { meta: string; from: string }[] }).playlist;
    expect(playlists).toHaveLength(1);
    expect(playlists[0]!.meta).toMatch(/^Spotify playlist · \d+ songs$/);
    expect(playlists[0]!.from).toMatch(/^https:\/\/open\.spotify\.com\/playlist\/[0-9A-Za-z]{22}$/);
  });
});

describe('[M3.spotify] your playlists on Music home', () => {
  const { tree, data } = readPage('music');

  it('lists them after the library, each opening its playlist page', () => {
    const titles = sections(tree).map(titleOf);
    expect(titles.at(-1)).toBe('Playlists');
    const each = eaches(tree).find((e) => e.of.join('.') === 'data.lists')!;
    const card = elements(each).find((e) => e.component === 'MediaCard')!;
    expect(card.props.onClick).toEqual({
      kind: 'open',
      page: 'playlist',
      params: { ref: [each.as, 'ref'] },
    });
    expect((data.lists as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('[M3.spotify] a playlist page', () => {
  const { tree, data } = readPage('playlist');
  const header = elements(tree).find((e) => e.component === 'MediaHeader')!;

  it('plays the playlist on the music queue as its own source, and re-imports from its menu', () => {
    expect(header.props.onPlay).toMatchObject({
      kind: 'play',
      queue: 'music',
      source: true,
      params: { ref: ['data', 'ref'] },
    });
    const menu = slotted(header, 'menu')!;
    expect(menu.props.onSelect).toEqual({ kind: 'choose', params: { ref: ['data', 'ref'] } });
    expect((data.menu as { key: string }[]).map((m) => m.key)).toContain('reimport');
    expect(data.meta).toMatch(/^From Spotify · \d+ of \d+ found$/);
  });

  it('plays a song from its row on the music queue', () => {
    const each = eaches(tree).find((e) => e.of.join('.') === 'data.songs')!;
    const row = elements(each).find((e) => e.component === 'ResultRow')!;
    expect(row.props.onAction).toMatchObject({
      kind: 'play',
      queue: 'music',
      next: false,
      source: false,
      params: { ref: [each.as, 'ref'] },
    });
  });

  it('lists last the songs YouTube Music lacks, each saying why, playing nothing', () => {
    const last = sections(tree).at(-1)!;
    expect(titleOf(last)).toBe('Not found on YouTube Music');
    expect(last.props.last).toEqual({ kind: 'literal', value: true });
    const rows = elements(last).filter((e) => e.component === 'ResultRow');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.props.onAction).toBeUndefined();
    expect(rows[0]!.props.onClick).toBeUndefined();
    const groups = data.unmatched as { songs: { meta: string; status: string }[] }[];
    const songs = groups.flatMap((g) => g.songs);
    expect(songs).toHaveLength(2);
    for (const song of songs) {
      expect(song.meta).toMatch(/^.+ · .+ · \d+:\d\d$/);
      expect(['Not found', 'Not a song']).toContain(song.status);
    }
  });

  it('[M3.spotify] the web plays and chooses through what the page is given', () => {
    const made = web('Playlist');
    expect(made).toContain("onPlay={play(data.ref, 'music', 'source')}");
    expect(made).toContain("onAction={play(song.ref, 'music', 'now')}");
    expect(made).toContain('onSelect={choose(data.ref)}');
  });
});

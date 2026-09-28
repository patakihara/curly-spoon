import { describe, expect, it } from 'vitest';
import type { PageTree, PropValue } from './page.js';
import { framePage } from './shell.js';
import { dataRoots, elements, readPage, shown, type Element } from './test-pages.js';

type Episode = {
  title: string;
  ref: string;
  meta: string[];
  progress: number | null;
  finished?: boolean;
  absent?: boolean;
};

const all = (tree: PageTree, component: string) =>
  elements(tree).filter((e) => e.component === component);
const one = (tree: PageTree, component: string): Element => {
  const found = all(tree, component);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const slotted = (e: Element, prop: string): Element | undefined => {
  const v = e.props[prop];
  return v?.kind === 'slot' && v.tree.kind === 'element' ? v.tree : undefined;
};
const lit = (value: string | number | boolean | null) => ({ kind: 'literal', value });
const bound = (...path: string[]) => ({ kind: 'binding', path });
const opens = (page: string, ...path: string[]) => ({ kind: 'open', page, params: { ref: path } });
const plays = (next: boolean, ...path: string[]) => ({
  kind: 'play',
  queue: 'spoken',
  next,
  params: { ref: path },
});
const sectionTitles = (tree: PageTree) =>
  all(tree, 'Section')
    .filter((e) => e.props.title !== undefined)
    .map((e) => e.props.title);
/** The Each item a row is drawn for, read from its bound title. */
const itemOf = (row: Element) =>
  row.props.title?.kind === 'binding' ? row.props.title.path[0]! : '';
/** Every Play handler on the page, wherever it sits. */
const playsOf = (tree: PageTree): PropValue[] =>
  elements(tree).flatMap((e) => Object.values(e.props).filter((v) => v.kind === 'play'));

/**
 * Every episode row opens its episode's page and plays it on the spoken queue, never the music
 * one (docs/plan/04-play.md), and shows how far you are into it.
 */
function episodeRows(tree: PageTree) {
  const rows = all(tree, 'EpisodeRow');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    const item = itemOf(row);
    expect(row.props.onClick, `${item} at line ${row.line}`).toEqual(opens('episode', item, 'ref'));
    expect(row.props.onPlay).toEqual(plays(false, item, 'ref'));
    expect(row.props.progress).toEqual(bound(item, 'progress'));
  }
}

describe('Show', () => {
  const { tree, data } = readPage('show');
  const header = one(tree, 'MediaHeader');
  const episodes = data.episodes as Episode[];

  it('[M0.canvas] binds only the show: name, kind, host, meta, art, subscription, menu, sort, episodes, about and related shows', () => {
    expect(dataRoots(tree)).toEqual([
      'about',
      'episodes',
      'following',
      'host',
      'image',
      'kind',
      'menu',
      'meta',
      'related',
      'sort',
      'subscribe',
      'title',
    ]);
  });

  it("[M0.canvas] names the show once, in the page's heading, with a local search over its episodes", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(framePage(tree).search).toBe("Search this show's episodes");
    expect(Object.keys(header.props)).not.toContain('title');
  });

  it('[M0.canvas] states whether you subscribe in place of queue buttons: you subscribe to listen', () => {
    const follow = slotted(header, 'actions');
    expect(follow?.component).toBe('FollowButton');
    expect(follow?.props.following).toEqual(bound('data', 'following'));
    expect(follow?.props.labels).toEqual(bound('data', 'subscribe'));
    expect(data.subscribe).toEqual({ on: 'Subscribed', off: 'Subscribe' });
    expect(slotted(header, 'menu')?.component).toBe('OverflowMenu');
  });

  it("[M0.canvas] greys every episode while you don't follow the show, and none once you do", () => {
    const row = one(tree, 'EpisodeRow');
    expect(row.props.absent).toEqual(bound('episode', 'absent'));
    for (const e of episodes) expect(e.absent, e.title).toBe(data.following !== true);
  });

  it('[M0.canvas] sorts its episodes newest or oldest first, and lists them in that order', () => {
    const bar = one(tree, 'SortFilterBar');
    expect(bar.props.label).toEqual(bound('data', 'sort'));
    expect(['Newest first', 'Oldest first']).toContain(data.sort);
    const dates = episodes.map((e) => Date.parse(e.meta[0]!));
    expect(dates.every((d) => !Number.isNaN(d))).toBe(true);
    const newest = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(data.sort === 'Newest first' ? newest : newest.reverse());
  });

  it('[M0.canvas] marks the episodes you have played and the one you are part-way through', () => {
    episodeRows(tree);
    expect(one(tree, 'EpisodeRow').props.finished).toEqual(bound('episode', 'finished'));
    expect(episodes.some((e) => e.finished)).toBe(true);
    const started = episodes.filter((e) => typeof e.progress === 'number');
    expect(started.length).toBeGreaterThan(0);
    for (const e of started) {
      expect(e.finished, e.title).toBe(false);
      expect(e.meta.at(-1), e.title).toMatch(/ left$/);
    }
  });

  it('[M0.canvas] shows the episodes, then about, then related shows, each opening its own page', () => {
    expect(sectionTitles(tree)).toEqual([
      lit('Episodes'),
      lit('About'),
      lit('You might also like'),
    ]);
    expect(one(tree, 'MediaCard').props.onClick).toEqual(opens('show', 'other', 'ref'));
    const related = data.related as { title: string }[];
    expect(related.map((r) => r.title)).not.toContain(data.title);
  });
});

describe('Episode', () => {
  const { tree, data } = readPage('episode');
  const header = one(tree, 'MediaHeader');
  const more = data.more as Episode[];

  it("[M0.canvas] binds only the episode: name, ref, kind, show, meta, progress, art, download, menu, notes and the show's other episodes", () => {
    expect(dataRoots(tree)).toEqual([
      'download',
      'image',
      'kind',
      'menu',
      'meta',
      'more',
      'notes',
      'progress',
      'ref',
      'show',
      'showRef',
      'title',
    ]);
  });

  it("[M0.canvas] names the episode once, in the page's heading, over the show's art with a link to the show", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(Object.keys(header.props)).not.toContain('title');
    expect(header.props.image).toEqual(bound('data', 'image'));
    expect(header.props.onSubtitle).toEqual(opens('show', 'data', 'showRef'));
  });

  it('[M0.canvas] gives its date, length and what is left, with the bar that shows it', () => {
    expect(data.meta).toMatch(/^\d{1,2} \w{3} \d{4} · .+ · .+ left$/);
    expect(header.props.progress).toEqual(bound('data', 'progress'));
    expect(typeof data.progress).toBe('number');
  });

  it('[M0.canvas] resumes it or plays it next on the spoken queue, adds it to a list, and keeps it on a phone', () => {
    expect([header.props.playLabel, header.props.nextLabel, header.props.lastLabel]).toEqual([
      lit('Resume'),
      lit('Play next'),
      lit(null),
    ]);
    expect(header.props.onPlay).toEqual(plays(false, 'data', 'ref'));
    expect(header.props.onPlayNext).toEqual(plays(true, 'data', 'ref'));
    expect(header.props.addLabel).toEqual(lit('Add to a list'));
    expect(header.props.download).toEqual(bound('data', 'download'));
    expect(slotted(header, 'menu')?.component).toBe('OverflowMenu');
  });

  it("[M0.canvas] shows its notes behind see more, then the show's other episodes, never this one", () => {
    expect(sectionTitles(tree)).toEqual([lit('Show notes'), lit('More from the show')]);
    expect(one(tree, 'ExpandableText').props.text).toEqual(bound('data', 'notes'));
    episodeRows(tree);
    expect(more.map((e) => e.ref)).not.toContain(data.ref);
  });
});

describe('List', () => {
  const { tree, data } = readPage('list');
  const header = one(tree, 'MediaHeader');
  const items = data.items as Episode[];

  it('[M0.canvas] binds only the list: name, ref, kind, meta, menu, shows, order and items', () => {
    expect(dataRoots(tree)).toEqual([
      'items',
      'kind',
      'menu',
      'meta',
      'order',
      'ref',
      'shows',
      'title',
    ]);
  });

  it("[M0.canvas] names the list in the page's heading and its kind in the header", () => {
    expect(framePage(tree).title).toEqual(bound('data', 'title'));
    expect(header.props.kindLabel).toEqual(bound('data', 'kind'));
    expect(['Listening list', 'Playlist', 'Digest']).toContain(data.kind);
  });

  it("[M0.canvas] names a digest's shows, each opening its page, and the order it plays in", () => {
    expect(data.kind).toBe('Digest');
    expect(sectionTitles(tree)).toEqual([lit('Shows'), lit('Episodes')]);
    expect(one(tree, 'MediaCard').props.onClick).toEqual(opens('show', 'show', 'ref'));
    expect(one(tree, 'SortFilterBar').props.label).toEqual(bound('data', 'order'));
    expect(['Oldest first', 'Newest first']).toContain(data.order);
    const shows = data.shows as { title: string }[];
    expect(data.meta).toMatch(new RegExp(`^${shows.length} shows · ${items.length} episodes · `));
    expect(data.meta).toMatch(new RegExp(`${String(data.order).toLowerCase()}$`));
  });

  it('[M0.canvas] lists a digest in chronological order from its shows, each episode naming its show', () => {
    episodeRows(tree);
    const shows = (data.shows as { title: string }[]).map((s) => s.title);
    for (const e of items) expect(shows, e.title).toContain(e.meta[0]);
    const dates = items.map((e) => Date.parse(e.meta[1]!));
    const oldest = [...dates].sort((a, b) => a - b);
    expect(dates).toEqual(data.order === 'Oldest first' ? oldest : oldest.reverse());
  });

  it('[M0.canvas] plays on the spoken queue and never offers to replace your queue', () => {
    expect(header.props.onPlay).toEqual(plays(false, 'data', 'ref'));
    expect(header.props.onPlayNext).toEqual(plays(true, 'data', 'ref'));
    expect(playsOf(tree).every((p) => p.kind === 'play' && p.queue === 'spoken')).toBe(true);
    const said = shown(tree, data).flatMap(({ element, values, text }) => [
      ...Object.keys(element.props).flatMap(values),
      ...text,
    ]);
    const menus = (data.menu as { label: string }[]).map((m) => m.label);
    for (const words of [...said, ...menus]) {
      expect(String(words)).not.toMatch(/replace|clear (the |your )?queue/i);
    }
  });
});

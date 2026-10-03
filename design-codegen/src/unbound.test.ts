import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actionProps } from './actions.js';
import { readNav, type NavPage } from './nav.js';
import { APP_DIR, REPO_ROOT, SONORA_DIR } from './outputs.js';
import { parsePage, type PageTree } from './page.js';
import { chrome, framePage, playerTab, playerTree, readShell, PLAYER_TABS } from './shell.js';
import { shellHandlers, type ShellHandlers } from './shell-handlers.js';
import { discoverComponents } from './sonora.js';
import { UNBOUND } from './unbound.js';

const appDir = join(REPO_ROOT, APP_DIR);
const nav = readNav(appDir);
const shell = readShell(appDir);
const sonora = discoverComponents(join(REPO_ROOT, SONORA_DIR)).map((c) => ({
  name: c.name,
  dts: readFileSync(c.dts, 'utf8'),
}));
const actions = new Map(sonora.map((c) => [c.name, actionProps(c.name, c.dts)]));
/** The components taking a `platform`, which the shell's trees then carry as a literal. */
const platformed = new Set(
  sonora.filter((c) => /^\s*platform\??:/m.test(c.dts)).map((c) => c.name),
);
const drawn = new Map(
  nav.pages
    .filter((p) => existsSync(join(appDir, 'pages', `${p.id}.page.jsx`)))
    .map((p) => [
      p.id,
      parsePage(readFileSync(join(appDir, 'pages', `${p.id}.page.jsx`), 'utf8'), p.id),
    ]),
);
const nowId = Object.keys(PLAYER_TABS).find((id) => PLAYER_TABS[id] === 'now')!;
const now = drawn.has(nowId) ? framePage(drawn.get(nowId)!).content : [];

type Platform = 'web' | 'android';
type Element = Extract<PageTree, { kind: 'element' }>;

/** Every element of `tree`, slots included; `shallow` stops at the root's children. */
function elements(tree: PageTree | undefined, shallow = false, into: Element[] = []): Element[] {
  if (tree === undefined) return into;
  if (tree.kind === 'element') {
    into.push(tree);
    for (const v of Object.values(tree.props)) if (v.kind === 'slot') elements(v.tree, false, into);
  }
  if (!shallow && 'children' in tree) tree.children.forEach((c) => elements(c, false, into));
  return into;
}

type Props = Element['props'];
/** Whether a prop is given, and not as null. */
const has = (props: Props, name: string) => {
  const v = props[name];
  return v !== undefined && !(v.kind === 'literal' && v.value === null);
};
const unless = (label: string) => (props: Props) =>
  !(props[label]?.kind === 'literal' && props[label]?.value === null);
/** MediaHeader draws its Play/Next/Last row only when no `actions` slot replaces it. */
const queueVerb = (label: string) => (props: Props) =>
  !has(props, 'actions') && unless(label)(props);
const playActions = (props: Props) =>
  ['onPlay', 'onPlayNext', 'onPlayLast'].some((p) => has(props, p));

/** The phone's player sheet draws it; the desktop's panel never does. */
const phoneOnly = (props: Props) =>
  !(props['platform']?.kind === 'literal' && props['platform'].value === 'desktop');

/** The desktop's player bar draws it; the phone's mini-player never does. */
const desktopOnly = (props: Props) => !phoneOnly(props);

/**
 * Where Sonora draws an action's control only on a condition, read from its `.jsx`: given another
 * prop, or given the action itself. Every other action's control is drawn whether given or not,
 * disabled without it.
 */
const DRAWN_WHEN: Readonly<Record<string, (props: Props) => boolean>> = {
  'Section.onAction': (props) => has(props, 'action') || has(props, 'actionText'),
  'SectionHeader.onAction': (props) => has(props, 'action') || has(props, 'actionText'),
  'Section.onSubject': () => false,
  'SectionHeader.onSubject': () => false,
  'MediaCard.onPlay': playActions,
  'MediaCard.onPlayNext': playActions,
  'MediaCard.onPlayLast': playActions,
  'MediaCard.onMore': () => false,
  'MediaCard.onRequest': () => false,
  'MediaHeader.onPlay': queueVerb('playLabel'),
  'MediaHeader.onPlayNext': queueVerb('nextLabel'),
  'MediaHeader.onPlayLast': queueVerb('lastLabel'),
  'MediaHeader.onSubtitle': () => false,
  'MediaHeader.onPartOf': () => false,
  'MediaHeader.onAdd': (props) => has(props, 'addLabel'),
  'MediaHeader.onDownload': (props) => has(props, 'download'),
  'ResultRow.onAction': () => false,
  'FeatureCard.onSave': () => false,
  'FeatureCard.onPlay': () => false,
  'FeatureCard.onMore': () => false,
  'EpisodeRow.onPlay': () => false,
  'StatusBanner.onAction': (props) => has(props, 'actionLabel'),
  'StatusBanner.onDismiss': () => false,
  'SearchField.onSubmit': () => false,
  'SearchField.onClose': () => false,
  // A player tab's close shows only when given; the panel's only on the phone's sheet.
  'PlayerSubPage.onClose': () => false,
  'LyricsPage.onClose': () => false,
  'QueuePage.onClose': () => false,
  'NowPlaying.onClose': phoneOnly,
  'NowPlaying.onMore': phoneOnly,
  'MiniPlayer.onToggleQueue': desktopOnly,
  'MiniPlayer.onToggleLyrics': desktopOnly,
  // The scrim that dismisses the side panel is drawn only for a panel over the page.
  'BackdropShell.onSheetDismiss': (props) =>
    props['sheetLayer']?.kind === 'literal' && props['sheetLayer'].value === 'over',
};

/** Whether `element` draws the control of `prop`: given, or drawn disabled without it. */
const drawsControl = (element: Element, prop: string) =>
  element.props[prop] !== undefined ||
  (DRAWN_WHEN[`${element.component}.${prop}`]?.(element.props) ?? true);

/**
 * Whether the app binds `prop` of `element`: the shell wires it, or the page opens a page or
 * starts signing in with it, or, on Android, plays with it. The web has no page player yet, and
 * neither app a request. An uncontrolled ExpandableText folds itself, its whole action its own.
 */
function bound(element: Element, prop: string, wired: ShellHandlers, platform: Platform) {
  if (wired.get(element)?.[prop] !== undefined) return true;
  if (element.component === 'ExpandableText' && prop === 'onToggle')
    return !('expanded' in element.props);
  const value = element.props[prop];
  if (value === undefined) return false;
  return (
    value.kind === 'open' ||
    value.kind === 'signIn' ||
    (value.kind === 'play' && platform === 'android')
  );
}

/** Each unbound action on `page` in `platform`'s app, at every layout it draws, as ledger keys. */
function unboundOn(page: NavPage, tree: PageTree, platform: Platform): string[] {
  const out: string[] = [];
  const check = (key: string, list: Element[], wired: ShellHandlers) => {
    for (const element of list) {
      for (const prop of actions.get(element.component) ?? []) {
        if (drawsControl(element, prop) && !bound(element, prop, wired, platform))
          out.push(`${key}/${element.component}.${prop}`);
      }
    }
  };
  const frame = framePage(tree);
  if (page.presentation === 'sheet') {
    const player = playerTree(playerTab(page), frame.content);
    const wired = shellHandlers(nav, page, { player }, platform);
    check('shell', elements(player, true), wired);
    check(
      page.id,
      frame.content.flatMap((c) => elements(c)),
      wired,
    );
    return out;
  }
  check(page.id, elements(tree), new Map());
  // Android draws the phone's layout alone; the web every layout, by the window's width.
  const layouts = platform === 'android' ? nav.layouts.slice(0, 1) : nav.layouts;
  for (const layout of layouts) {
    const parts = chrome(nav, shell, page, layout, platformed, now);
    const wired = shellHandlers(nav, page, { chrome: parts }, platform);
    // The side panel's content is Now Playing's own page, checked as that page.
    check(
      'shell',
      [parts.rail, parts.leading, parts.player].flatMap((t) => elements(t)),
      wired,
    );
    check('shell', elements(parts.sheet, true), wired);
  }
  return out;
}

const unbound = new Set(
  (['web', 'android'] as const).flatMap((platform) =>
    nav.pages
      .filter((p) => p.platforms.includes(platform) && drawn.has(p.id))
      .flatMap((p) => unboundOn(p, drawn.get(p.id)!, platform)),
  ),
);

const planItems = new Set(
  readdirSync(join(REPO_ROOT, 'docs/plan'))
    .filter((f) => f.endsWith('.md'))
    .flatMap((f) =>
      [
        ...readFileSync(join(REPO_ROOT, 'docs/plan', f), 'utf8').matchAll(
          /^- \*\*\[([^\]]+)\]\*\*/gm,
        ),
      ].map(([, id]) => id!),
    ),
);

describe('the unbound-action ledger', () => {
  it('[M0.states/d] names the plan item that binds every action a page or its shell leaves unbound', () => {
    const missing = [...unbound].filter((key) => UNBOUND[key] === undefined).sort();
    expect(missing).toEqual([]);
  });

  it('[M0.states/d] keeps no line for an action both apps bind, or that no page draws', () => {
    const stale = Object.keys(UNBOUND).filter((key) => !unbound.has(key));
    expect(stale).toEqual([]);
  });

  it('[M0.states/d] names only items the plan has', () => {
    const unknown = Object.entries(UNBOUND)
      .filter(([, item]) => !planItems.has(item))
      .map(([key, item]) => `${key}: ${item}`);
    expect(unknown).toEqual([]);
  });
});

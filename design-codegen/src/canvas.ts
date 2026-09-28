/**
 * The Auralis canvas artifact (claude.ai Design type), drawn from design/app: every drawn page as a
 * phone and a desktop `.dc.html` artboard mounting Sonora's real components from the installed
 * copy under `project/ds/<folder>/`, and `canvas.json`, the index that records which Sonora publish
 * is installed. Build output only (`pnpm canvas:build`), never committed.
 */
import type { App } from './app.js';
import type { PageTree, PropValue } from './page.js';

/** Sonora's bundle global; its components mount as `<Ns>.<Name>`. */
export const SONORA_NAMESPACE = 'SonoraDesignSystem_6c1435';
/** The installed copy's folder under `project/ds/`: the namespace, lower-cased, as the type asks. */
export const DS_FOLDER = SONORA_NAMESPACE.toLowerCase();
/** The files of Sonora's publish an artboard loads, in load order, under `project/ds/<folder>/`. */
export const DS_FILES = [
  'tokens.json',
  'tokens.css',
  'components/bundle.css',
  'components/bundle.js',
];

/** When the canvas artifact was created; the type's marker, kept on every republish. */
export const CANVAS_CREATED_AT = '2026-09-27T14:27:33Z';

export const CANVAS_BOARDS = {
  phone: { width: 390, height: 844, platform: 'mobile', label: 'phone' },
  desktop: { width: 1440, height: 900, platform: 'desktop', label: 'desktop' },
} as const;
const GAP_X = 80;
const GAP_Y = 120;

/** The Sonora publish the canvas installs; `version` null only in a draft build. */
export interface SonoraInstall {
  title: string;
  artifact: string;
  version: string | null;
}

const escapeAttr = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const escapeText = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

function attr(name: string, value: PropValue): string {
  if (value.kind === 'binding') return `${kebab(name)}="{{${value.path.join('.')}}}"`;
  if (typeof value.value === 'string') return `${kebab(name)}="${escapeAttr(value.value)}"`;
  return `${kebab(name)}="{{ ${JSON.stringify(value.value)} }}"`;
}

function count(placeholder: unknown, path: string[]): number {
  let at: unknown = placeholder;
  for (const key of path.slice(1)) at = (at as Record<string, unknown> | undefined)?.[key];
  return Array.isArray(at) ? at.length : 1;
}

function render(
  tree: PageTree,
  platform: string,
  platformed: Set<string>,
  placeholder: unknown,
): string {
  const kids = (nodes: PageTree[]) =>
    nodes.map((n) => render(n, platform, platformed, placeholder)).join('');
  switch (tree.kind) {
    case 'text':
      return escapeText(tree.value);
    case 'binding':
      return `{{${tree.path.join('.')}}}`;
    case 'each': {
      const n = tree.of[0] === 'data' ? count(placeholder, tree.of) : 1;
      return `<sc-for list="{{${tree.of.join('.')}}}" as="${tree.as}" hint-placeholder-count="${n}">\n${kids(tree.children)}</sc-for>\n`;
    }
    case 'when':
      return `<sc-if value="{{when.${tree.state}}}" hint-placeholder-val="{{ true }}">\n${kids(tree.children)}</sc-if>\n`;
    case 'element': {
      const attrs = Object.entries(tree.props).map(([name, value]) => ' ' + attr(name, value));
      if (platformed.has(tree.component) && !('platform' in tree.props)) {
        attrs.push(` platform="${platform}"`);
      }
      const open = `<x-import component-from-global-scope="${SONORA_NAMESPACE}.${tree.component}"${attrs.join('')}>`;
      const inner = kids(tree.children);
      const block = tree.children.some((c) => c.kind !== 'text' && c.kind !== 'binding');
      return `${open}${block ? '\n' : ''}${inner}</x-import>\n`;
    }
  }
}

function artboard(
  app: App,
  page: App['pages'][number],
  board: (typeof CANVAS_BOARDS)[keyof typeof CANVAS_BOARDS],
): string {
  const title = app.nav.pages.find((p) => p.id === page.id)?.title ?? page.id;
  const data = JSON.stringify(page.placeholder).replace(/<\/script/gi, '<\\/script');
  const preview = JSON.stringify({ $preview: { width: board.width, height: board.height } });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeText(title)} · ${board.label}</title>`,
    '<script src="./support.js"></script>',
    `<link rel="stylesheet" href="ds/${DS_FOLDER}/tokens.css">`,
    `<link rel="stylesheet" href="ds/${DS_FOLDER}/components/bundle.css">`,
    `<script src="ds/${DS_FOLDER}/components/bundle.js"></script>`,
    '</head>',
    '<body>',
    '<x-dc>',
    '<helmet>',
    '<style>body{margin:0}</style>',
    '</helmet>',
    `<div data-theme="dark" style="width: ${board.width}px; height: ${board.height}px; overflow: auto; background: var(--surface-bg); color: var(--surface-fg); font-family: var(--font-body)">`,
    render(page.tree, board.platform, app.components.platformed, page.placeholder).trimEnd(),
    '</div>',
    '</x-dc>',
    `<script type="text/x-dc" data-dc-script data-props='${preview}'>`,
    'class Component extends DCLogic {',
    'renderVals() {',
    `return { data: ${data}, when: {"full":true} };`,
    '}',
    '}',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Every file under the canvas's `project/` but the installed Sonora copy, by path under it. */
export function generateCanvas(app: App, sonora: SonoraInstall, now: Date): Map<string, string> {
  const files = new Map<string, string>();
  const boards: Record<string, Record<string, unknown>> = {};
  const { phone, desktop } = CANVAS_BOARDS;
  const rowHeight = Math.max(phone.height, desktop.height) + GAP_Y;
  app.pages.forEach((page, row) => {
    const title = app.nav.pages.find((p) => p.id === page.id)?.title ?? page.id;
    let x = 0;
    for (const board of [phone, desktop]) {
      const name = `${page.id}.${board.label}.dc.html`;
      files.set(name, artboard(app, page, board));
      boards[name] = {
        x,
        y: row * rowHeight,
        w: board.width,
        h: board.height,
        title: `${title} · ${board.label}`,
      };
      x += board.width + GAP_X;
    }
  });
  const at = now.toISOString();
  const index = {
    v: 3,
    createdOnFiles: { v: 1, at: CANVAS_CREATED_AT },
    title: 'Auralis',
    launch: { view: 'canvas' },
    pages: [],
    boards,
    order: Object.keys(boards),
    notes: {},
    designSystems: [
      {
        title: sonora.title,
        namespace: DS_FOLDER,
        artifact: sonora.artifact,
        version: sonora.version,
        copiedAt: at,
      },
    ],
  };
  files.set('canvas.json', `${JSON.stringify(index, null, 2)}\n`);
  return files;
}

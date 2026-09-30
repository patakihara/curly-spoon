/**
 * The canvas's structure boards, generated from nav.json. On the start page, `flows.dc.html`, the
 * navigation flowchart, and `screens.dc.html`, the list of screens; on each screen's own canvas
 * page, `<id>.structure.dc.html`, its purpose, sections, empty state and links. Each names the
 * others by link. They use Sonora's tokens only, no components: they describe pages, they don't
 * draw them.
 */
import type { Nav, NavPage } from './nav.js';

/** A column of both artboards: one destination, the player's sheets, or the rest of the app. */
export interface Group {
  id: string;
  label: string;
  pages: NavPage[];
}

const OTHER_GROUPS = [
  { id: 'player', label: 'Player', holds: (p: NavPage) => p.presentation === 'sheet' },
  { id: 'app', label: 'Around the app', holds: () => true },
];

/**
 * The pages by column, in the order links reach them: a destination's from its home page, any
 * other column's from each page nothing in it links to, then whatever is left, in nav.json's order.
 */
export function groupPages(nav: Nav): Group[] {
  const groups: Group[] = nav.destinations.map((d) => ({ id: d.id, label: d.label, pages: [] }));
  const others: Group[] = OTHER_GROUPS.map(({ id, label }) => ({ id, label, pages: [] }));
  for (const page of nav.pages) {
    const group =
      page.lights === null
        ? others[OTHER_GROUPS.findIndex((g) => g.holds(page))]!
        : groups.find((g) => g.id === page.lights)!;
    group.pages.push(page);
  }
  for (const group of [...groups, ...others]) {
    const byId = new Map(group.pages.map((p) => [p.id, p]));
    const linked = new Set(group.pages.flatMap((p) => p.structure.links));
    const starts = byId.has(group.id)
      ? [group.id]
      : group.pages.filter((p) => !linked.has(p.id)).map((p) => p.id);
    const ordered: NavPage[] = [];
    for (const start of [...starts, ...group.pages.map((p) => p.id)]) {
      const queue = [start];
      while (queue.length > 0) {
        const page = byId.get(queue.shift()!)!;
        if (ordered.includes(page)) continue;
        ordered.push(page);
        queue.push(...page.structure.links.filter((l) => byId.has(l)));
      }
    }
    group.pages = ordered;
  }
  return [...groups, ...others].filter((g) => g.pages.length > 0);
}

const escapeText = (s: string) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');

const titleOf = (nav: Nav, id: string) => nav.pages.find((p) => p.id === id)?.title ?? id;

/** The destinations' order on each kind of navigation, from nav.json's layouts. */
export function navOrder(nav: Nav): string {
  const label = (id: string) => nav.destinations.find((d) => d.id === id)?.label ?? id;
  const names = {
    bottomBar: 'the phone’s bottom bar',
    iconRail: 'the rail',
    labelledRail: 'the rail',
  };
  const seen = new Map<string, string>();
  for (const l of nav.layouts) {
    const order = l.order.map(label).join(', ');
    const name = names[l.nav];
    if (!seen.has(name)) seen.set(name, order);
  }
  return [...seen].map(([name, order]) => `On ${name}: ${order}.`).join(' ');
}

/**
 * nav.json's back model in words, said once, on the screen list, rather than on every page. Each
 * sentence is keyed by the model's value, so a new model fails to type-check until it is worded.
 */
export function backModel(nav: Nav): string[] {
  const close: Record<Nav['back']['close'], string> = {
    opener: '✕ (or up) returns to whatever opened the screen, and on to what opened that.',
  };
  const stacks: Record<Nav['back']['stacks'], string> = {
    perDestination:
      'Each destination keeps its own stack: leave Music on an album, come back, and ✕ goes from the album to the artist it was opened from.',
  };
  const android: Record<Nav['back']['android'], string> = {
    close: "Android's back does what ✕ does.",
  };
  const web: Record<Nav['back']['web'], string> = {
    previousView: "The browser's back goes to the previous view, wherever that was.",
  };
  return [
    `${close[nav.back.close]} ${stacks[nav.back.stacks]}`,
    `${android[nav.back.android]} ${web[nav.back.web]} A sheet closes to the page under it.`,
  ];
}

/** What sets a page apart: a sheet, a bare page, or one platform only. */
function kind(page: NavPage): string[] {
  const out: string[] = [];
  if (page.presentation === 'sheet') out.push('sheet');
  if (page.presentation === 'bare') out.push('bare');
  if (page.platforms.length === 1)
    out.push(`${page.platforms[0] === 'android' ? 'Android' : 'web'} only`);
  return out;
}

/** A page's kind, after whether it is drawn yet. */
const marks = (page: NavPage, drawn: Set<string>) => [
  drawn.has(page.id) ? 'drawn' : 'structure only',
  ...kind(page),
];

/** An artboard's page around its fixed-size root; `head` loads Sonora's tokens. */
function artboard(
  head: string[],
  title: string,
  width: number,
  height: number,
  style: string,
  body: string[],
): string {
  const preview = JSON.stringify({ $preview: { width, height } });
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeText(title)}</title>`,
    '<script src="./support.js"></script>',
    ...head,
    '</head>',
    '<body>',
    '<x-dc>',
    '<helmet>',
    '<style>body{margin:0}</style>',
    '</helmet>',
    `<div data-theme="dark" style="width: ${width}px; height: ${height}px; overflow: auto; box-sizing: border-box; background: var(--surface-bg); color: var(--surface-fg); font-family: var(--font-body); ${style}">`,
    ...body,
    '</div>',
    '</x-dc>',
    `<script type="text/x-dc" data-dc-script data-props='${preview}'>`,
    'class Component extends DCLogic {',
    'renderVals() {',
    'return {};',
    '}',
    '}',
    '</script>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** The screen list's columns, and a page's structure board: one column of the same width. */
export const STRUCTURE_BOARD = { column: 340, gap: 40, pad: 56 };

const MUTED = 'color: var(--surface-fg-muted)';
const LABEL = `margin: 0; font-size: var(--text-xs); line-height: var(--leading-xs); font-weight: var(--weight-strong); letter-spacing: 0.06em; text-transform: uppercase; ${MUTED}`;
const BODY = 'margin: 0; font-size: var(--text-md); line-height: var(--leading-lg)';
const LINK = 'color: var(--accent); text-decoration: underline; text-underline-offset: 3px';
const STRONG = 'font-weight: var(--weight-strong)';

/** A page's structure board, by file name: what every link to a screen's canvas page names. */
export const structureBoard = (id: string) => `${id}.structure.dc.html`;
/** The screen list, on the start page: what every link back to the map names. */
export const SCREENS = 'screens.dc.html';

const link = (href: string, text: string, style = '') =>
  `<a href="${href}" style="${LINK}${style === '' ? '' : `; ${style}`}">${escapeText(text)}</a>`;

/** Roughly how tall a block of text sets in a column, so the artboard's height fits its text. */
function lines(text: string, chars: number): number {
  let n = 0;
  for (const para of text.split('\n')) n += Math.max(1, Math.ceil((para.length + 4) / chars));
  return n;
}

const CHARS = 44;

function block(nav: Nav, page: NavPage, drawn: Set<string>): { html: string[]; height: number } {
  const { structure } = page;
  const titles = structure.links.map((l) => titleOf(nav, l));
  const leads =
    structure.links.length === 0
      ? `<span style="${MUTED}">nothing</span>`
      : structure.links.map((l) => link(structureBoard(l), titleOf(nav, l))).join(', ');
  const html = [
    `<section style="display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: var(--radius-md); background: var(--surface-card); border: 1px solid var(--surface-border)">`,
    `<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px">`,
    `<h3 style="margin: 0; font-family: var(--font-display); font-size: var(--h4-size); line-height: var(--h4-leading); font-weight: var(--heading-weight)">${escapeText(page.title)}</h3>`,
    `<p style="margin: 0; font-size: var(--text-xs); ${MUTED}">${escapeText(page.route)}</p>`,
    '</div>',
    `<p style="${LABEL}">${escapeText(marks(page, drawn).join(' · '))}</p>`,
    `<p style="${BODY}">${escapeText(structure.purpose)}</p>`,
    `<ol style="margin: 0; padding: 0 0 0 20px; display: flex; flex-direction: column; gap: 6px; ${BODY}">`,
    ...structure.sections.map(
      (s) =>
        `<li><strong style="${STRONG}">${escapeText(s.name)}</strong>` +
        (s.provisional
          ? ` <span style="font-size: var(--text-xs); font-weight: var(--weight-strong); color: var(--tone-request)">PROVISIONAL</span>`
          : '') +
        `<br><span style="${MUTED}">${escapeText(s.holds)}</span></li>`,
    ),
    '</ol>',
    `<p style="${BODY}"><strong style="${STRONG}">Empty: </strong><span style="${MUTED}">${escapeText(structure.empty)}</span></p>`,
    `<p style="${BODY}"><strong style="${STRONG}">Leads to: </strong>${leads}</p>`,
    '</section>',
  ];
  const textLines =
    2 +
    lines(structure.purpose, CHARS) +
    structure.sections.reduce((n, s) => n + 1 + lines(s.holds, CHARS), 0) +
    lines(`Empty: ${structure.empty}`, CHARS) +
    lines(`Leads to: ${titles.join(', ') || 'nothing'}`, CHARS);
  const height = 80 + textLines * 20 + (structure.sections.length + 3) * 6;
  return { html, height };
}

/**
 * `<id>.structure.dc.html`, the first board on a screen's canvas page: a link back to the screen
 * list, then its purpose, sections, empty state, and links to the canvas pages it leads to.
 */
export function generatePageStructure(
  nav: Nav,
  page: NavPage,
  drawn: Set<string>,
  head: string[],
): { html: string; width: number; height: number } {
  const { column, pad } = STRUCTURE_BOARD;
  const { html: body, height: tall } = block(nav, page, drawn);
  const back = 28;
  const width = pad * 2 + column;
  const height = pad * 2 + back + 16 + tall;
  const html = artboard(
    head,
    `${page.title} · structure`,
    width,
    height,
    `padding: ${pad}px; display: flex; flex-direction: column; gap: 16px`,
    [
      `<p style="margin: 0; font-size: var(--text-md); line-height: ${back}px">${link(SCREENS, '← Screen map')}</p>`,
      ...body,
    ],
  );
  return { html, width, height };
}

/**
 * `screens.dc.html`, beside the flowchart on the start page: one column per group, one row per
 * page with its route, marks and purpose, its title linking to the page's canvas page.
 */
export function generateScreens(
  nav: Nav,
  drawn: Set<string>,
  head: string[],
): { html: string; width: number; height: number } {
  const { column, gap, pad } = STRUCTURE_BOARD;
  const groups = groupPages(nav);
  const width = pad * 2 + groups.length * column + (groups.length - 1) * gap;
  let tallest = 0;
  const columns = groups.map((g) => {
    const rows = g.pages.map((page) => ({
      html: [
        `<div style="display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; border-radius: var(--radius-md); background: var(--surface-card); border: 1px solid var(--surface-border)">`,
        `<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 12px">`,
        `<h3 style="margin: 0; font-family: var(--font-display); font-size: var(--h4-size); line-height: var(--h4-leading); font-weight: var(--heading-weight)">${link(structureBoard(page.id), page.title, 'color: var(--surface-fg)')}</h3>`,
        `<p style="margin: 0; font-size: var(--text-xs); ${MUTED}">${escapeText(page.route)}</p>`,
        '</div>',
        `<p style="${LABEL}">${escapeText(marks(page, drawn).join(' · '))}</p>`,
        `<p style="${BODY}; ${MUTED}">${escapeText(page.structure.purpose)}</p>`,
        '</div>',
      ],
      height: 60 + (1 + lines(page.structure.purpose, CHARS)) * 20 + 24,
    }));
    tallest = Math.max(
      tallest,
      rows.reduce((n, r) => n + r.height + 16, 0),
    );
    return [
      `<div style="display: flex; flex-direction: column; gap: 16px; min-width: 0">`,
      `<h2 style="margin: 0 0 8px; font-family: var(--font-display); font-size: var(--h3-size); line-height: var(--h3-leading); font-weight: var(--heading-weight); color: var(--accent)">${escapeText(g.label)}</h2>`,
      ...rows.flatMap((r) => r.html),
      '</div>',
    ];
  });
  const header = [
    `<h1 style="margin: 0; font-family: var(--font-display); font-size: var(--h1-size); line-height: var(--h1-leading); font-weight: var(--heading-weight)">The screens</h1>`,
    `<p style="margin: 0; max-width: 900px; font-size: var(--text-lg); line-height: var(--leading-xl); ${MUTED}">Every page of nav.json, grouped by the destination it lights up. Each title opens that screen’s canvas page: its sections, empty state and links beside its mockups. Every screen also reaches the five destinations and Settings, and Now Playing through the mini-player.</p>`,
    `<p style="margin: 0; max-width: 900px; font-size: var(--text-lg); line-height: var(--leading-xl)"><strong style="${STRONG}">Back: </strong>${escapeText(backModel(nav).join(' '))}</p>`,
    `<p style="margin: 0; max-width: 900px; font-size: var(--text-lg); line-height: var(--leading-xl)"><strong style="${STRONG}">Navigation: </strong>${escapeText(navOrder(nav))}</p>`,
  ];
  const height = pad * 2 + 220 + 56 + tallest;
  const html = artboard(
    head,
    'Screens',
    width,
    height,
    `padding: ${pad}px; display: flex; flex-direction: column; gap: 40px`,
    [
      `<div style="display: flex; flex-direction: column; gap: 12px">`,
      ...header,
      '</div>',
      `<div style="display: grid; grid-template-columns: repeat(${groups.length}, ${column}px); gap: ${gap}px; align-items: start">`,
      ...columns.flat(),
      '</div>',
    ],
  );
  return { html, width, height };
}

export const FLOWS_BOARD = {
  node: { w: 250, h: 56 },
  /** How far a child sits right of its parent; its line runs down that gap. */
  indent: 34,
  gap: 72,
  /** Space between two nodes of a column. */
  space: 24,
  pad: 72,
  top: 250,
  /** A link line: 16 px tall, about 7 px a character at 12 px. */
  linkLine: 16,
  charPx: 7,
};

/** A page's node: where it sits, its column, and the text it carries. */
export interface Box {
  page: NavPage;
  x: number;
  y: number;
  w: number;
  h: number;
  column: number;
  depth: number;
  root: boolean;
  /** The page's route, and whether it is a sheet or on one platform only. */
  detail: string;
  /** Links that aren't tree children, by page id, and wrapped for the node. */
  links: string[];
  linkLines: string[];
}

/** A tree line from a page down to a page it is first to link to in its column, as a polyline. */
export interface TreeLine {
  from: Box;
  to: Box;
  points: [number, number][];
}

/**
 * Wraps `→ A · B · C` at the separators so no line runs past `chars` characters; a continued
 * line is drawn indented under the first title.
 */
function wrapLinks(titles: string[], chars: number): string[] {
  const out: string[] = [];
  let line = '→';
  for (const t of titles) {
    const next = line === '→' ? `→ ${t}` : `${line} · ${t}`;
    if (next.length + (out.length > 0 ? 2 : 0) > chars && line !== '→') {
      out.push(line);
      line = t;
    } else line = next;
  }
  if (titles.length > 0) out.push(line);
  return out;
}

/**
 * Every page's node on the flowchart. One column per group; within it each page sits under the
 * first page of the column to link to it, indented, so the column reads as a small tree. Every
 * other link is text on the node, and the node grows to fit it.
 */
export function layoutFlows(nav: Nav): {
  boxes: Map<string, Box>;
  groups: Group[];
  lines: TreeLine[];
  columns: { x: number; w: number }[];
  width: number;
  height: number;
} {
  const { node, indent, gap, space, pad, top, linkLine, charPx } = FLOWS_BOARD;
  const groups = groupPages(nav);
  const boxes = new Map<string, Box>();
  const lines: TreeLine[] = [];
  const columns: { x: number; w: number }[] = [];
  let x = pad;
  let bottom = top;
  groups.forEach((g, column) => {
    const parentOf = (p: NavPage) => {
      const before = g.pages.slice(0, g.pages.indexOf(p));
      return before.find((q) => q.structure.links.includes(p.id))?.id ?? null;
    };
    const childrenOf = (id: string) => g.pages.filter((p) => parentOf(p) === id);
    const order: { page: NavPage; depth: number }[] = [];
    const visit = (page: NavPage, depth: number) => {
      if (order.some((o) => o.page === page)) return;
      order.push({ page, depth });
      for (const child of childrenOf(page.id)) visit(child, depth + 1);
    };
    for (const page of g.pages) if (parentOf(page) === null) visit(page, 0);
    for (const page of g.pages) visit(page, 0);
    const deepest = Math.max(...order.map((o) => o.depth));
    const w = node.w + deepest * indent;
    columns.push({ x, w });
    let y = top;
    for (const { page, depth } of order) {
      const children = new Set(childrenOf(page.id).map((p) => p.id));
      const links = [...new Set(page.structure.links)].filter((l) => !children.has(l));
      const linkLines = wrapLinks(
        links.map((l) => titleOf(nav, l)),
        Math.floor((node.w - 28) / charPx),
      );
      const detail = [page.route, ...kind(page)].join(' · ');
      const box: Box = {
        page,
        x: x + depth * indent,
        y,
        w: node.w,
        h: node.h + (linkLines.length > 0 ? linkLines.length * linkLine + 4 : 0),
        column,
        depth,
        root: page.id === g.id,
        detail,
        links,
        linkLines,
      };
      boxes.set(page.id, box);
      y += box.h + space;
    }
    bottom = Math.max(bottom, y - space);
    for (const { page } of order) {
      const parent = parentOf(page);
      if (parent === null) continue;
      const from = boxes.get(parent)!;
      const to = boxes.get(page.id)!;
      const lx = from.x + indent / 2;
      const ly = to.y + 26;
      lines.push({
        from,
        to,
        points: [
          [lx, from.y + from.h],
          [lx, ly],
          [to.x - 2, ly],
        ],
      });
    }
    x += w + gap;
  });
  return { boxes, groups, lines, columns, width: x - gap + pad, height: bottom + 110 };
}

/** `flows.dc.html`: the navigation flowchart, a small tree per column, other links as text. */
export function generateFlows(
  nav: Nav,
  drawn: Set<string>,
  head: string[],
): { html: string; width: number; height: number } {
  const { pad, linkLine } = FLOWS_BOARD;
  const { boxes, groups, lines, width, height } = layoutFlows(nav);
  const muted = 'fill: var(--surface-fg-muted)';
  const svg: string[] = [
    `<svg width="${width}" height="${height}" style="display: block" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How the screens link to each other">`,
    '<defs>',
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
    `<path d="M 0 0 L 10 5 L 0 10 z" style="${muted}"></path>`,
    '</marker>',
    '</defs>',
    `<text x="${pad}" y="${pad + 36}" style="font-family: var(--font-display); font-size: 36px; font-weight: 900; fill: var(--surface-fg)">How the screens link</text>`,
    `<text x="${pad}" y="${pad + 72}" style="font-size: 18px; ${muted}">Each column is a destination drawn as a tree: a line runs from a screen to the screens it is first to open. The → line on a screen lists its other links.</text>`,
    `<text x="${pad}" y="${pad + 100}" style="font-size: 18px; ${muted}">Not shown: every screen also reaches the destinations, Settings, and Now Playing through the mini-player.</text>`,
  ];
  groups.forEach((g) => {
    const first = boxes.get(g.pages[0]!.id)!;
    svg.push(
      `<text x="${first.x}" y="${first.y - 28}" style="font-family: var(--font-display); font-size: 22px; font-weight: 900; fill: var(--accent)">${escapeText(g.label)}</text>`,
    );
  });
  for (const { from, to, points } of lines) {
    svg.push(
      `<polyline points="${points.map((p) => p.join(',')).join(' ')}" style="fill: none; stroke: var(--surface-fg-muted); stroke-opacity: 0.7; stroke-width: 1.5" marker-end="url(#arrow)"><title>${escapeText(`${from.page.title} to ${to.page.title}`)}</title></polyline>`,
    );
  }
  for (const box of boxes.values()) {
    const dashed = drawn.has(box.page.id) ? '' : ' stroke-dasharray: 6 4;';
    const stroke = box.root ? 'var(--accent)' : 'var(--surface-fg-muted)';
    svg.push(
      `<a href="${structureBoard(box.page.id)}">`,
      `<g><title>${escapeText(box.page.structure.purpose)}</title>`,
      `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="10" style="fill: var(--surface-card); stroke: ${stroke}; stroke-width: ${box.root ? 2.5 : 1.25};${dashed}"></rect>`,
      `<text x="${box.x + 14}" y="${box.y + 24}" style="font-size: 16px; font-weight: 700; fill: var(--surface-fg)">${escapeText(box.page.title)}</text>`,
      `<text x="${box.x + 14}" y="${box.y + 44}" style="font-size: 12px; ${muted}">${escapeText(box.detail)}</text>`,
      ...box.linkLines.map(
        (text, i) =>
          `<text x="${box.x + (i === 0 ? 14 : 28)}" y="${box.y + 64 + i * linkLine}" style="font-size: 12px; fill: var(--surface-fg)">${escapeText(text)}</text>`,
      ),
      '</g>',
      '</a>',
    );
  }
  const legendY = height - 70;
  const lx = pad;
  svg.push(
    `<rect x="${lx}" y="${legendY}" width="36" height="22" rx="6" style="fill: var(--surface-card); stroke: var(--accent); stroke-width: 2.5"></rect>`,
    `<text x="${lx + 48}" y="${legendY + 16}" style="font-size: 14px; ${muted}">a destination</text>`,
    `<rect x="${lx + 200}" y="${legendY}" width="36" height="22" rx="6" style="fill: var(--surface-card); stroke: var(--surface-fg-muted); stroke-width: 1.25"></rect>`,
    `<text x="${lx + 248}" y="${legendY + 16}" style="font-size: 14px; ${muted}">drawn on the canvas</text>`,
    `<rect x="${lx + 440}" y="${legendY}" width="36" height="22" rx="6" style="fill: var(--surface-card); stroke: var(--surface-fg-muted); stroke-width: 1.25; stroke-dasharray: 6 4"></rect>`,
    `<text x="${lx + 488}" y="${legendY + 16}" style="font-size: 14px; ${muted}">structure only, not drawn yet</text>`,
    `<text x="${lx + 760}" y="${legendY + 16}" style="font-size: 14px; ${muted}">→ its other links</text>`,
  );
  svg.push('</svg>');
  const html = artboard(head, 'Flows', width, height, '', svg);
  return { html, width, height };
}

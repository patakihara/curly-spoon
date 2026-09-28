/**
 * The canvas's structure row, generated from nav.json: `structure.dc.html`, every page's purpose,
 * sections, empty state and links as plain text, and `flows.dc.html`, the navigation flowchart.
 * Both use Sonora's tokens only, no components: they describe pages, they don't draw them.
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
 * The pages by column: a destination's pages in the order its home page reaches them through
 * links, then any it doesn't reach, in nav.json's order.
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
  for (const group of groups) {
    const byId = new Map(group.pages.map((p) => [p.id, p]));
    const ordered: NavPage[] = [];
    const queue = byId.has(group.id) ? [group.id] : [];
    while (queue.length > 0) {
      const page = byId.get(queue.shift()!)!;
      if (ordered.includes(page)) continue;
      ordered.push(page);
      queue.push(...page.structure.links.filter((l) => byId.has(l)));
    }
    group.pages = [...ordered, ...group.pages.filter((p) => !ordered.includes(p))];
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

/** How a page goes back: up to its parent, or back through history. */
function backOf(nav: Nav, page: NavPage): string {
  return page.back.startsWith('up:')
    ? `up to ${titleOf(nav, page.back.slice(3))}`
    : 'back through history';
}

/** What sets a page apart: a sheet, one platform only, and whether it is drawn yet. */
function marks(page: NavPage, drawn: Set<string>): string[] {
  const out = [drawn.has(page.id) ? 'drawn' : 'structure only'];
  if (page.presentation === 'sheet') out.push('sheet');
  if (page.platforms.length === 1)
    out.push(`${page.platforms[0] === 'android' ? 'Android' : 'web'} only`);
  return out;
}

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

export const STRUCTURE_BOARD = { column: 340, gap: 40, pad: 56 };

const MUTED = 'color: var(--surface-fg-muted)';
const LABEL = `margin: 0; font-size: var(--text-xs); line-height: var(--leading-xs); font-weight: var(--weight-strong); letter-spacing: 0.06em; text-transform: uppercase; ${MUTED}`;
const BODY = 'margin: 0; font-size: var(--text-md); line-height: var(--leading-lg)';

/** Roughly how tall a block of text sets in a column, so the artboard's height fits its text. */
function lines(text: string, chars: number): number {
  let n = 0;
  for (const para of text.split('\n')) n += Math.max(1, Math.ceil((para.length + 4) / chars));
  return n;
}

function block(nav: Nav, page: NavPage, drawn: Set<string>): { html: string[]; height: number } {
  const { structure } = page;
  const chars = 44;
  const links = structure.links.map((l) => titleOf(nav, l)).join(', ') || 'nothing';
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
        `<li><strong style="font-weight: var(--weight-strong)">${escapeText(s.name)}</strong>` +
        (s.provisional
          ? ` <span style="font-size: var(--text-xs); font-weight: var(--weight-strong); color: var(--tone-request)">PROVISIONAL</span>`
          : '') +
        `<br><span style="${MUTED}">${escapeText(s.holds)}</span></li>`,
    ),
    '</ol>',
    `<p style="${BODY}"><strong style="font-weight: var(--weight-strong)">Empty: </strong><span style="${MUTED}">${escapeText(structure.empty)}</span></p>`,
    `<p style="${BODY}"><strong style="font-weight: var(--weight-strong)">Links to: </strong><span style="${MUTED}">${escapeText(links)}</span></p>`,
    `<p style="${BODY}"><strong style="font-weight: var(--weight-strong)">Back: </strong><span style="${MUTED}">${escapeText(backOf(nav, page))}</span></p>`,
    '</section>',
  ];
  const textLines =
    2 +
    lines(structure.purpose, chars) +
    structure.sections.reduce((n, s) => n + 1 + lines(s.holds, chars), 0) +
    lines(`Empty: ${structure.empty}`, chars) +
    lines(`Links to: ${links}`, chars) +
    1;
  const height = 80 + textLines * 20 + (structure.sections.length + 4) * 6;
  return { html, height };
}

/** `structure.dc.html`: one column per group, one block per page, as plain text. */
export function generateStructure(
  nav: Nav,
  drawn: Set<string>,
  head: string[],
): { html: string; width: number; height: number } {
  const { column, gap, pad } = STRUCTURE_BOARD;
  const groups = groupPages(nav);
  const width = pad * 2 + groups.length * column + (groups.length - 1) * gap;
  let tallest = 0;
  const columns = groups.map((g) => {
    const blocks = g.pages.map((p) => block(nav, p, drawn));
    tallest = Math.max(
      tallest,
      blocks.reduce((n, b) => n + b.height + 16, 0),
    );
    return [
      `<div style="display: flex; flex-direction: column; gap: 16px; min-width: 0">`,
      `<h2 style="margin: 0 0 8px; font-family: var(--font-display); font-size: var(--h3-size); line-height: var(--h3-leading); font-weight: var(--heading-weight); color: var(--accent)">${escapeText(g.label)}</h2>`,
      ...blocks.flatMap((b) => b.html),
      '</div>',
    ];
  });
  const header = [
    `<h1 style="margin: 0; font-family: var(--font-display); font-size: var(--h1-size); line-height: var(--h1-leading); font-weight: var(--heading-weight)">What each screen holds</h1>`,
    `<p style="margin: 0; max-width: 900px; font-size: var(--text-lg); line-height: var(--leading-xl); ${MUTED}">Every page of nav.json, grouped by the destination it lights up. Sections run top to bottom; a provisional one is not settled yet. Every screen also reaches the five destinations and Settings, and Now Playing through the mini-player.</p>`,
  ];
  const height = pad * 2 + 140 + 56 + tallest;
  const html = artboard(
    head,
    'Structure',
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
  node: { w: 240, h: 56 },
  column: 360,
  row: 104,
  pad: 72,
  top: 260,
};

interface Box {
  page: NavPage;
  x: number;
  y: number;
  root: boolean;
}

/** Every page's box on the flowchart: one column per group, rows in the group's order. */
export function layoutFlows(nav: Nav): {
  boxes: Map<string, Box>;
  groups: Group[];
  width: number;
  height: number;
} {
  const { node, column, row, pad, top } = FLOWS_BOARD;
  const groups = groupPages(nav);
  const boxes = new Map<string, Box>();
  groups.forEach((g, col) => {
    g.pages.forEach((page, i) => {
      boxes.set(page.id, {
        page,
        x: pad + 48 + col * column,
        y: top + i * row,
        root: page.id === g.id,
      });
    });
  });
  const rows = Math.max(...groups.map((g) => g.pages.length));
  return {
    boxes,
    groups,
    width: pad * 2 + 48 + (groups.length - 1) * column + node.w + 48,
    height: top + rows * row + 150,
  };
}

type Side = 'left' | 'right';

/**
 * Which side of each box a link leaves and enters by: across columns side to side, within one
 * column both on the left.
 */
function sides(from: Box, to: Box): [Side, Side] {
  if (from.x === to.x) return ['left', 'left'];
  return to.x > from.x ? ['right', 'left'] : ['left', 'right'];
}

/**
 * Every link as a curve. The links meeting one side of a box spread along it in the order of
 * their other ends, so arrows arrive at separate points and don't cross at the box.
 */
function edgePaths(boxes: Map<string, Box>): { from: Box; to: Box; d: string }[] {
  const { w, h } = FLOWS_BOARD.node;
  const links = [...boxes.values()].flatMap((from) =>
    from.page.structure.links.map((l) => ({ from, to: boxes.get(l)! })),
  );
  const ports = new Map<string, { key: number; other: Box }[]>();
  const port = (box: Box, side: Side, key: number, other: Box) => {
    const id = `${box.page.id}:${side}`;
    ports.set(id, [...(ports.get(id) ?? []), { key, other }]);
  };
  links.forEach(({ from, to }, i) => {
    const [out, into] = sides(from, to);
    port(from, out, i, to);
    port(to, into, i, from);
  });
  const yAt = (box: Box, side: Side, key: number) => {
    const list = [...ports.get(`${box.page.id}:${side}`)!].sort(
      (a, b) => a.other.y - b.other.y || a.other.x - b.other.x || a.key - b.key,
    );
    const i = list.findIndex((p) => p.key === key);
    return box.y + 8 + ((h - 16) * (i + 1)) / (list.length + 1);
  };
  return links.map(({ from, to }, i) => {
    const [out, into] = sides(from, to);
    const y1 = yAt(from, out, i);
    const y2 = yAt(to, into, i);
    if (out === 'left' && into === 'left') {
      const bulge = 24 + Math.abs(to.y - from.y) / 6;
      const x = from.x;
      return {
        from,
        to,
        d: `M ${x} ${y1} C ${x - bulge} ${y1}, ${x - bulge} ${y2}, ${x - 2} ${y2}`,
      };
    }
    const x1 = out === 'right' ? from.x + w : from.x;
    const x2 = into === 'left' ? to.x - 2 : to.x + w + 2;
    const dx = Math.max(60, Math.abs(x2 - x1) / 3) * (x2 > x1 ? 1 : -1);
    return { from, to, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` };
  });
}

/** `flows.dc.html`: the navigation flowchart, the five destinations as roots, links as edges. */
export function generateFlows(
  nav: Nav,
  drawn: Set<string>,
  head: string[],
): { html: string; width: number; height: number } {
  const { node } = FLOWS_BOARD;
  const { boxes, groups, width, height } = layoutFlows(nav);
  const svg: string[] = [
    `<svg width="${width}" height="${height}" style="display: block" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="How the screens link to each other">`,
    '<defs>',
    '<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">',
    '<path d="M 0 0 L 10 5 L 0 10 z" style="fill: var(--surface-fg-muted)"></path>',
    '</marker>',
    '</defs>',
    `<text x="${FLOWS_BOARD.pad}" y="${FLOWS_BOARD.pad + 36}" style="font-family: var(--font-display); font-size: 36px; font-weight: 900; fill: var(--surface-fg)">How the screens link</text>`,
    `<text x="${FLOWS_BOARD.pad}" y="${FLOWS_BOARD.pad + 72}" style="font-size: 18px; fill: var(--surface-fg-muted)">The five destinations are the roots. An arrow is a link a screen offers; every screen also reaches the destinations, Settings, and Now Playing through the mini-player.</text>`,
  ];
  groups.forEach((g) => {
    const first = boxes.get(g.pages[0]!.id)!;
    svg.push(
      `<text x="${first.x}" y="${first.y - 28}" style="font-family: var(--font-display); font-size: 22px; font-weight: 900; fill: var(--accent)">${escapeText(g.label)}</text>`,
    );
  });
  for (const { from, to, d } of edgePaths(boxes)) {
    svg.push(
      `<path d="${d}" style="fill: none; stroke: var(--surface-fg-muted); stroke-opacity: 0.45; stroke-width: 1.5" marker-end="url(#arrow)"><title>${escapeText(`${from.page.title} to ${to.page.title}`)}</title></path>`,
    );
  }
  for (const box of boxes.values()) {
    const dashed = drawn.has(box.page.id) ? '' : ' stroke-dasharray: 6 4;';
    const stroke = box.root ? 'var(--accent)' : 'var(--surface-fg-muted)';
    const sheet = box.page.presentation === 'sheet' ? ' · sheet' : '';
    svg.push(
      `<g><title>${escapeText(box.page.structure.purpose)}</title>`,
      `<rect x="${box.x}" y="${box.y}" width="${node.w}" height="${node.h}" rx="10" style="fill: var(--surface-card); stroke: ${stroke}; stroke-width: ${box.root ? 2.5 : 1.25};${dashed}"></rect>`,
      `<text x="${box.x + 14}" y="${box.y + 24}" style="font-size: 16px; font-weight: 700; fill: var(--surface-fg)">${escapeText(box.page.title)}</text>`,
      `<text x="${box.x + 14}" y="${box.y + 44}" style="font-size: 12px; fill: var(--surface-fg-muted)">${escapeText(`${box.page.back.startsWith('up:') ? '↑ ' : '← '}${backOf(nav, box.page)}${sheet}`)}</text>`,
      '</g>',
    );
  }
  const legendY = height - 90;
  const lx = FLOWS_BOARD.pad;
  svg.push(
    `<rect x="${lx}" y="${legendY}" width="36" height="22" rx="6" style="fill: var(--surface-card); stroke: var(--accent); stroke-width: 2.5"></rect>`,
    `<text x="${lx + 48}" y="${legendY + 16}" style="font-size: 14px; fill: var(--surface-fg-muted)">a destination</text>`,
    `<rect x="${lx + 200}" y="${legendY}" width="36" height="22" rx="6" style="fill: var(--surface-card); stroke: var(--surface-fg-muted); stroke-width: 1.25"></rect>`,
    `<text x="${lx + 248}" y="${legendY + 16}" style="font-size: 14px; fill: var(--surface-fg-muted)">drawn on the canvas</text>`,
    `<rect x="${lx + 440}" y="${legendY}" width="36" height="22" rx="6" style="fill: var(--surface-card); stroke: var(--surface-fg-muted); stroke-width: 1.25; stroke-dasharray: 6 4"></rect>`,
    `<text x="${lx + 488}" y="${legendY + 16}" style="font-size: 14px; fill: var(--surface-fg-muted)">structure only, not drawn yet</text>`,
    `<text x="${lx + 760}" y="${legendY + 16}" style="font-size: 14px; fill: var(--surface-fg-muted)">↑ up to its parent · ← back through history</text>`,
  );
  svg.push('</svg>');
  const html = artboard(head, 'Flows', width, height, '', svg);
  return { html, width, height };
}

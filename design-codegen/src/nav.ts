/**
 * `design/app/nav.json`: the destinations, the layouts per width and every page of the app, and
 * the web route table generated from it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { APP_NOTE } from './outputs.js';

const Id = z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'a camelCase id');

const Destination = z
  .object({ id: Id, label: z.string().min(1), icon: z.string().min(1) })
  .strict();

const Layout = z
  .object({
    minWidth: z.number().int().nonnegative(),
    nav: z.enum(['bottomBar', 'iconRail', 'labelledRail']),
    sidePanel: z.literal('nowPlaying').optional(),
  })
  .strict();

/** What a page is compared against: a UI kit screen, a showcase card, or nothing in Sonora. */
export const SonoraSource = z
  .string()
  .regex(
    /^(kit:(mobile|desktop)\/[a-z]+|card:[a-z0-9-]+|none)$/,
    'kit:<platform>/<screen>, card:<stem> or none',
  );

const Page = z
  .object({
    id: Id,
    route: z.string().regex(/^(\*|\/[^?]*(\?[a-z][A-Za-z0-9]*(&[a-z][A-Za-z0-9]*)*)?)$/),
    params: z.record(z.string(), z.string().min(1)).default({}),
    lights: Id.nullable(),
    back: z.string().regex(/^(history|up:[a-z][A-Za-z0-9]*)$/),
    presentation: z.enum(['screen', 'sheet']),
    platforms: z
      .array(z.enum(['web', 'android']))
      .min(1)
      .default(['web', 'android']),
    title: z.string().min(1),
    endpoint: z.string().optional(),
    sources: z
      .object({
        sonora: z.array(SonoraSource).min(1),
        spotify: z.array(z.string().regex(/^S\d\d$/)),
        kickoff: z.string().optional(),
      })
      .strict(),
  })
  .strict();

const NavFile = z
  .object({
    destinations: z.array(Destination),
    layouts: z.array(Layout),
    pages: z.array(Page),
  })
  .strict();

export type Nav = z.infer<typeof NavFile>;
export type NavPage = Nav['pages'][number];

/** A route's path, as the router matches it, and the query names it reads. */
export function splitRoute(route: string): { path: string; query: string[] } {
  const [path = '', query] = route.split('?');
  return { path, query: query === undefined ? [] : query.split('&') };
}

/** Parses nav.json's content, then checks what the schema alone cannot: every id it refers to. */
export function parseNav(json: unknown): Nav {
  const nav = NavFile.parse(json);
  const errors: string[] = [];
  const destinations = new Set(nav.destinations.map((d) => d.id));
  const ids = new Set<string>();
  for (const page of nav.pages) {
    if (ids.has(page.id)) errors.push(`${page.id}: declared twice`);
    ids.add(page.id);
  }
  for (const page of nav.pages) {
    if (page.lights !== null && !destinations.has(page.lights)) {
      errors.push(`${page.id}: lights ${page.lights}, which is not a destination`);
    }
    if (page.back.startsWith('up:') && !ids.has(page.back.slice(3))) {
      errors.push(`${page.id}: goes up to ${page.back.slice(3)}, which is not a page`);
    }
    const inRoute = [...splitRoute(page.route).path.matchAll(/:([A-Za-z0-9]+)/g)].map((m) => m[1]);
    const declared = Object.keys(page.params);
    if (inRoute.sort().join() !== declared.sort().join()) {
      errors.push(`${page.id}: route parameters [${inRoute}] differ from params [${declared}]`);
    }
  }
  if (errors.length > 0) throw new Error(`nav.json:\n  ${errors.join('\n  ')}`);
  return nav;
}

export function readNav(appDir: string): Nav {
  return parseNav(JSON.parse(readFileSync(join(appDir, 'nav.json'), 'utf8')));
}

/** A page id as its component name: `nowPlaying` is `NowPlaying`. */
export const componentName = (id: string) => id[0]!.toUpperCase() + id.slice(1);

const literal = (value: unknown) => JSON.stringify(value).replaceAll('"', "'");

/**
 * `routes.tsx`: the destinations, layouts and web pages as data, and the React Router table.
 * A page not yet drawn (no `pages/<id>.page.jsx`) gets a route with no element.
 */
export function generateRoutes(nav: Nav, drawn: Set<string>): string {
  const pages = nav.pages.filter((p) => p.platforms.includes('web'));
  const imports = pages
    .filter((p) => drawn.has(p.id))
    .map((p) => `import ${componentName(p.id)} from '../pages/${componentName(p.id)}';`);
  const rows = pages.map((p) => {
    const { path, query } = splitRoute(p.route);
    return (
      `  { id: ${literal(p.id)}, path: ${literal(path)}, query: ${literal(query)}, ` +
      `title: ${literal(p.title)}, lights: ${literal(p.lights)}, back: ${literal(p.back)}, ` +
      `presentation: ${literal(p.presentation)} },`
    );
  });
  const routes = pages.map((p) => {
    const { path } = splitRoute(p.route);
    const element = drawn.has(p.id) ? `, element: <${componentName(p.id)} />` : '';
    return `  { id: ${literal(p.id)}, path: ${literal(path)}${element} },`;
  });
  return [
    `// ${APP_NOTE}`,
    "import type { RouteObject } from 'react-router';",
    ...imports,
    '',
    `export const destinations = ${JSON.stringify(nav.destinations, null, 2)} as const;`,
    '',
    `export const layouts = ${JSON.stringify(nav.layouts, null, 2)} as const;`,
    '',
    'export interface PageRoute {',
    '  id: string;',
    '  path: string;',
    '  query: readonly string[];',
    '  title: string;',
    '  lights: string | null;',
    '  back: string;',
    "  presentation: 'screen' | 'sheet';",
    '}',
    '',
    'export const pages: readonly PageRoute[] = [',
    ...rows,
    '];',
    '',
    'export const routes: RouteObject[] = [',
    ...routes,
    '];',
    '',
  ].join('\n');
}

/**
 * `platform.ts`: which density the window width calls for. Phone density holds while the layout
 * is the bottom bar, below the first width with a rail.
 */
export function generatePlatform(nav: Nav): string {
  const rails = nav.layouts.filter((l) => l.nav !== 'bottomBar').map((l) => l.minWidth);
  const phoneMax = rails.length > 0 ? Math.min(...rails) - 1 : Number.MAX_SAFE_INTEGER;
  return [
    `// ${APP_NOTE}`,
    "import { useSyncExternalStore } from 'react';",
    '',
    "export type Platform = 'mobile' | 'desktop';",
    '',
    `const PHONE = '(max-width: ${phoneMax}px)';`,
    '',
    'function subscribe(onChange: () => void): () => void {',
    '  const query = window.matchMedia(PHONE);',
    "  query.addEventListener('change', onChange);",
    "  return () => query.removeEventListener('change', onChange);",
    '}',
    '',
    '/** The density the window width calls for; desktop when there is no window. */',
    'export function usePlatform(): Platform {',
    '  return useSyncExternalStore(',
    '    subscribe,',
    "    () => (window.matchMedia(PHONE).matches ? 'mobile' : 'desktop'),",
    "    () => 'desktop',",
    '  );',
    '}',
    '',
  ].join('\n');
}

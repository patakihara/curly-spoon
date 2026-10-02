import { readFileSync } from 'node:fs';

/**
 * The pages of the navigation map, read from design/app/nav.json as the web routes are, so a test
 * walking them covers a page drawn later the day it lands.
 */
export interface NavPage {
  id: string;
  route: string;
  title: string;
  platforms?: string[];
}

export const navPages = (
  JSON.parse(readFileSync(new URL('../../design/app/nav.json', import.meta.url), 'utf8')) as {
    pages: NavPage[];
  }
).pages;

const onWeb = (p: NavPage) => p.platforms === undefined || p.platforms.includes('web');

/** Every page the web draws. */
export const webPages = navPages.filter(onWeb);

/** Every page another platform draws and the web does not. */
export const otherPages = navPages.filter((p) => !onWeb(p));

/** The route with each parameter given a sample value and the query dropped; `*` an unknown path. */
export const pathOf = (route: string) =>
  route === '*' ? '/no-such-page' : route.replace(/\?.*$/, '').replace(/:\w+/g, 'sample');

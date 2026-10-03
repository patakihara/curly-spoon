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
  /** `sheet` for a player sheet, drawn in the side panel where a layout has one. */
  presentation: string;
}

const nav = JSON.parse(
  readFileSync(new URL('../../design/app/nav.json', import.meta.url), 'utf8'),
) as { pages: NavPage[]; layouts: { minWidth: number; sidePanelOpens?: string }[] };

export const navPages = nav.pages;

/** The narrowest width whose layout draws the player's side panel open beside the page. */
const panelFrom = Math.min(
  ...nav.layouts.filter((l) => l.sidePanelOpens === 'always').map((l) => l.minWidth),
);

/**
 * Whether `page`, opened at `width`, gives way to the page under it: a player sheet where the
 * layout holds the player in its side panel, which the app shows at the sheet's tab instead.
 */
export const givesWay = (page: NavPage, width: number) =>
  page.presentation === 'sheet' && width >= panelFrom;

const onWeb = (p: NavPage) => p.platforms === undefined || p.platforms.includes('web');

/** Every page the web draws. */
export const webPages = navPages.filter(onWeb);

/** Every page another platform draws and the web does not. */
export const otherPages = navPages.filter((p) => !onWeb(p));

/** The route with each parameter given a sample value and the query dropped; `*` an unknown path. */
export const pathOf = (route: string) =>
  route === '*' ? '/no-such-page' : route.replace(/\?.*$/, '').replace(/:\w+/g, 'sample');

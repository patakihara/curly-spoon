import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNav } from './nav.js';
import { APP_DIR, REPO_ROOT } from './outputs.js';

const appDir = join(REPO_ROOT, APP_DIR);
const nav = readNav(appDir);

/** What a page says it holds in nav.json: its purpose, sections and empty state. */
const structureText = (id: string): string => {
  const s = nav.pages.find((p) => p.id === id)!.structure;
  return [s.purpose, ...s.sections.flatMap((x) => [x.name, x.holds]), s.empty].join('\n');
};

/** Everything a page draws or describes: its nav.json structure, page file and placeholder. */
const pageText = (id: string): string =>
  [
    structureText(id),
    readFileSync(join(appDir, 'pages', `${id}.page.jsx`), 'utf8'),
    readFileSync(join(appDir, 'placeholders', `${id}.json`), 'utf8'),
  ].join('\n');

/** Offering to add a channel: a sentence or line naming a channel and adding, pasting or its link. */
const offersToAddChannel = (text: string) =>
  text
    .split(/[.\n]/)
    .some((line) => /\bchannels?\b/i.test(line) && /\b(add\w*|past\w*|link)\b/i.test(line));

describe('Adding a YouTube channel', () => {
  it('[M3.ytshows/e] is offered by Search alone of the pages in nav.json', () => {
    const offering = nav.pages.map((p) => p.id).filter((id) => offersToAddChannel(pageText(id)));
    expect(offering).toEqual(['search']);
  });

  it('[M3.ytshows/e] Search finds a channel by name among its podcasts or from its pasted link', () => {
    const search = structureText('search');
    expect(search).toMatch(/YouTube channel/);
    expect(search).toMatch(/by name/);
    expect(search).toMatch(/pasted link/);
  });
});

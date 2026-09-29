import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { galleryEntries, generateGallery, readCards } from './gallery.js';
import { REPO_ROOT, SONORA_DIR } from './outputs.js';
import { discoverComponents } from './sonora.js';

const sonoraDir = join(REPO_ROOT, SONORA_DIR);

/** A throwaway Sonora tree: `files` maps a path under `components/` to its text. */
const trees: string[] = [];
function sonoraOf(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-gallery-'));
  trees.push(dir);
  for (const [rel, text] of Object.entries(files)) {
    const file = join(dir, 'components', rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return dir;
}
afterEach(() => {
  for (const dir of trees.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const component = (name: string) => ({
  [`basic/${name}.jsx`]: `export function ${name}() { return null; }\n`,
  [`basic/${name}.d.ts`]: `export interface ${name}Props {}\n`,
});
/** A card in Sonora's form: a Babel script that destructures the components it draws. */
const card = (body: string) =>
  `<!-- @dsCard group="Basic" name="Fixture" -->\n<div id="root"></div>\n<script type="text/babel">\n${body}\n</script>\n`;

const entriesOf = (dir: string) => galleryEntries(discoverComponents(dir), readCards(dir));

describe('the web gallery draws every Sonora component from a card', () => {
  it('[M0.tokens/c] every Sonora component with a .d.ts has a gallery entry', () => {
    const components = discoverComponents(sonoraDir);
    const { entries, missing } = galleryEntries(components, readCards(sonoraDir));
    expect(missing, 'components with no card usage whose props are all literals').toEqual([]);
    expect(entries.map((e) => e.name)).toEqual(components.map((c) => c.name));
  });

  it('[M0.tokens/c] skips a usage with a non-literal prop for the next usage', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      'basic/a.card.html': card(`const { Chip } = window.DS;
function Demo(){
  const [on, setOn] = React.useState(false);
  return <div><Chip label="Live" selected={on} onClick={() => setOn(!on)}/><Chip label="Still" size={2} tone="warm"/></div>;
}`),
    });
    const [chip] = entriesOf(dir).entries;
    expect(chip?.jsx).toBe('<div><Chip label="Still" size={2} tone="warm"/></div>');
    expect(chip?.card).toBe('basic/a.card.html');
  });

  it('names a component whose every usage takes a non-literal prop as missing', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      'basic/a.card.html': card(`function Demo({ label }){ return <Chip label={label}/>; }`),
    });
    expect(entriesOf(dir)).toEqual({ entries: [], missing: ['Chip'] });
  });

  it('writes a top-level constant of literals inline, and takes glyph spans and nested components', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      ...component('Row'),
      'basic/a.card.html': card(`const TAGS = ['a', 'b'];
const art = { src: 'x.jpg', round: true };
function Demo(){
  return <Row tags={TAGS} {...art} title>
    <span style={{fontFamily:'Material Symbols Rounded'}}>close</span>
    <Chip label="One"/>
  </Row>;
}`),
    });
    const row = entriesOf(dir).entries.find((e) => e.name === 'Row');
    expect(row?.jsx).toBe(`<Row tags={(['a', 'b'])} {...({ src: 'x.jpg', round: true })} title>
    <span style={{fontFamily:'Material Symbols Rounded'}}>close</span>
    <Chip label="One"/>
  </Row>`);
    expect(row?.uses).toEqual(['Chip', 'Row']);
  });

  it('frames a usage in the literal element that holds it, unless that element sets a theme', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      ...component('Row'),
      'basic/a.card.html': card(`const x = <div data-theme="dark"><Chip label="A"/></div>;
const y = <div style={{height: 320, position: 'relative'}} onClick={() => go()}><Row/></div>;`),
    });
    const [chip, row] = entriesOf(dir).entries;
    expect(chip?.jsx).toBe('<Chip label="A"/>');
    expect(row?.jsx).toBe(
      `<div style={{height: 320, position: 'relative'}} onClick={() => {}}><Row/></div>`,
    );
  });

  it('takes a function that reads only its own arguments, such as a renderRow', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      ...component('List'),
      'basic/a.card.html': card(`const ITEMS = [{ title: 'A' }];
const x = <List items={ITEMS} renderRow={({ item, key, drag }) => <Chip key={key} label={item.title} {...drag}/>}/>;
const y = <List renderRow={() => <Chip label={outside}/>}/>;`),
    });
    const list = entriesOf(dir).entries.find((e) => e.name === 'List');
    expect(list?.jsx).toBe(
      `<List items={([{ title: 'A' }])} renderRow={({ item, key, drag }) => <Chip key={key} label={item.title} {...drag}/>}/>`,
    );
    expect(list?.uses).toEqual(['Chip', 'List']);
  });

  it('writes a shorthand property on a constant as a full one', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      'basic/a.card.html': card(`const label = 'One';\nconst x = <Chip {...{ label }}/>;`),
    });
    expect(entriesOf(dir).entries[0]?.jsx).toBe(`<Chip {...{ label: ('One') }}/>`);
  });

  it('takes the cards in path order, so the first usable usage wins', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      'basic/b.card.html': card(`const x = <Chip label="B"/>;`),
      'basic/a.card.html': card(`const x = <Chip label="A"/>;`),
    });
    expect(entriesOf(dir).entries[0]?.jsx).toBe('<Chip label="A"/>');
  });

  it('generates a gallery that imports from the UI package and draws each entry in dark and light', () => {
    const dir = sonoraOf({
      ...component('Chip'),
      'basic/a.card.html': card(`const x = <Chip label="A"/>;`),
    });
    const files = generateGallery(dir, discoverComponents(dir));
    expect([...files.keys()].sort()).toEqual(['index.d.ts', 'index.jsx']);
    const jsx = files.get('index.jsx')!;
    expect(jsx).toMatch(/^\/\/ Generated by pnpm gen from design\/sonora\. Do not edit\./);
    expect(jsx).toContain(`import { Chip } from '../ui';`);
    expect(jsx).toContain(`name: 'Chip'`);
    expect(jsx).toContain(`render: () => (<Chip label="A"/>)`);
    expect(jsx).toContain('data-theme="dark"');
    expect(jsx).toContain('data-theme="light"');
    expect(jsx).toContain('data-component={name}');
  });
});

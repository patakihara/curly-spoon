/**
 * HTML entities in text an upstream passes on as it scraped it: an indexer's titles
 * (`Ghosts I&ndash;IV`, `Rock &amp; Roll`) and a detail page's names. Numeric entities, and the
 * named ones such titles carry; any other name stays as written.
 */
const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

const ENTITY = /&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]{2,8}));/gi;

export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (all, decimal?: string, hex?: string, name?: string) => {
    if (name !== undefined) return NAMED[name.toLowerCase()] ?? all;
    const point = decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? '', 16);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : all;
  });
}

/**
 * What AudiobookBay's detail page says about the audio a release holds, and Prowlarr's row does not:
 * who reads it, its bitrate and format, and its info hash. The site has no API and its markup moves,
 * so anything not found is simply left out: a page that cannot be read costs a release its extras,
 * never the search. Only text is read from the page, never a link.
 */

export interface DetailExtras {
  narrators?: string[];
  bitrateKbps?: number;
  format?: string;
  infoHash?: string;
}

/** A longer page is cut here: the fields sit near its start, and these are a third party's bytes. */
const MAX_CHARS = 1024 * 1024;

/** What a page writes where it does not know who reads the book. */
const NO_NARRATOR = /^(?:unknown|n\/?a|none|various|-+)$/i;

const NARRATOR = /<span[^>]*\bclass="narrator"[^>]*>([^<]*)<\/span>/gi;
const FORMAT = /<span[^>]*\bclass="format"[^>]*>\s*([a-z0-9]+)\s*<\/span>/i;
const BITRATE = /<span[^>]*\bclass="bitrate"[^>]*>\s*(\d{1,4})\s*kbps\s*<\/span>/i;
const INFO_HASH = /Info Hash:\s*<\/td>\s*<td[^>]*>\s*([0-9a-f]{40})\s*</i;

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d{1,7});/g, (all, code: string) => {
      const point = Number(code);
      return point <= 0x10ffff ? String.fromCodePoint(point) : all;
    })
    .replace(/&amp;/g, '&')
    .trim();
}

export function parseDetail(page: string): DetailExtras {
  const html = page.slice(0, MAX_CHARS);
  const narrators = [...html.matchAll(NARRATOR)]
    .map((match) => decodeEntities(match[1] ?? ''))
    .filter((name) => name.length > 0 && !NO_NARRATOR.test(name));
  const format = FORMAT.exec(html)?.[1];
  const bitrate = BITRATE.exec(html)?.[1];
  const infoHash = INFO_HASH.exec(html)?.[1];
  return {
    ...(narrators.length > 0 ? { narrators: [...new Set(narrators)] } : {}),
    ...(bitrate === undefined ? {} : { bitrateKbps: Number(bitrate) }),
    ...(format === undefined ? {} : { format: format.toLowerCase() }),
    ...(infoHash === undefined ? {} : { infoHash: infoHash.toLowerCase() }),
  };
}

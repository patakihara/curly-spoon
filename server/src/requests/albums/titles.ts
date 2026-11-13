/**
 * What a torrent's title says of an album release: its format, its bit depth and rate, whether it
 * is a pack of several albums, the words that mark it as something other than the album (live,
 * stems, a DVD…), and its edition words. Titles arrive with entities decoded (the Prowlarr client)
 * and are folded with `searchFold`, so "Ghosts I–IV" and "Ghosts I-IV" read alike; an underscore
 * reads as a space ("Nine_Inch_Nails-The_Slip-(Bonus_DVD)").
 *
 * Also the album's own names, folded the same way, and whether a title or a file name holds them.
 */
import { searchFold } from '../../text/fold.js';

/** Best first: lossless FLAC, MP3 at 320, other MP3, a format not named, one refused. */
export type AlbumFormat = 'flac' | 'mp3-320' | 'mp3' | 'unknown' | 'refused';

export interface TitleFacts {
  /** The title folded, an underscore read as a space. */
  folded: string;
  /** Its words: letters and numbers, a number without leading zeros. */
  words: string[];
  format: AlbumFormat;
  /** 16 or 24, where the title names it. */
  bitDepth: number | null;
  /** In kHz, where the title names it: 44.1, 48, 88.2, 96, 192. */
  sampleRate: number | null;
  /** Several albums: a discography, a complete works, an anthology. */
  pack: boolean;
  /** What marks it as something other than the album, as the title writes it: `live`, `dvd`… */
  markers: string[];
  /** Edition words: `deluxe`, `2cd`, `disc 2`, `bonus`, `remaster`, `reissue`. */
  editionWords: string[];
}

/**
 * Formats with no writer here, so never taken: ALAC, AAC, Ogg, WAV, APE, WavPack, and DTS or 5.1
 * surround mixes. Checked before FLAC, so "Apple Lossless" is ALAC.
 */
const REFUSED =
  /\b(?:alac|apple lossless|aac|m4a|ogg|vorbis|wav|wave|ape|wv|wavpack|dts)\b|(?<![\d.])5\.1(?!\d)/;
const FLAC =
  /\bflac\b|\blossless\b|\bhi-?res\b|\b(?:16|24)[ -]?bits?\b|\b(?:16|24) ?[-/] ?(?:44|48|88|96|176|192)\b|\b(?:96|192) ?\/ ?24\b/;
const MP3_320 = /(?<![\d.])320(?![\d.])/;
const MP3 = /\bmp3\b|\bv0\b|\bvbr\b|(?<![\d.])(?:256|192)(?![\d.])/;

const PACK = /\b(?:discography|complete|anthology|albums)\b/;

/** Each marker, and the words in a title that show it. */
const MARKERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['live', /\blive\b/],
  ['instrumental', /\binstrumentals?\b/],
  ['karaoke', /\bkaraoke\b/],
  ['remix', /\bremix(?:es|ed)?\b/],
  ['stems', /\bstems?\b/],
  ['dvd', /\bdvd/],
  ['blu-ray', /\bblu-?ray\b/],
  ['5.1', /(?<![\d.])5\.1(?!\d)/],
  ['surround', /\bsurround\b/],
  ['from the basement', /\bfrom the basement\b/],
  ['rehearsal', /\brehearsals?\b/],
  ['sampler', /\bsampler\b/],
  ['rar', /\brar\b/],
  ['zip', /\bzip\b/],
  ['image', /\bimage\b/],
];
// A cue sheet with one audio file is no marker of its own: one listed file rejects a row anyway.
const EDITION: ReadonlyArray<readonly [string, RegExp]> = [
  ['deluxe', /\bdeluxe\b/],
  ['2cd', /\b[2-9] ?cd\b/],
  ['disc 2', /\b(?:disc|cd|disk) ?[2-9]\b/],
  ['bonus', /\bbonus\b/],
  ['remaster', /\bremaster(?:ed)?\b/],
  ['reissue', /\breissue\b/],
];

/** The title folded for matching: `searchFold`, an underscore read as a space. */
export const foldTitle = (text: string): string => searchFold(text.replace(/_/g, ' '));

/** Letters and numbers make words; a number is written without leading zeros, so 01 is 1. */
export function wordsOf(text: string): string[] {
  return foldTitle(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => (/^\d+$/.test(word) ? String(Number(word)) : word));
}

/** Whether `words` holds `run` in order, next to one another. An empty run is never held. */
export function holdsRun(words: readonly string[], run: readonly string[]): boolean {
  if (run.length === 0) return false;
  for (let i = 0; i + run.length <= words.length; i += 1) {
    if (run.every((word, k) => words[i + k] === word)) return true;
  }
  return false;
}

function sampleRateOf(folded: string): number | null {
  const khz = /\b(44|48|88|96|176|192)(?:[ .,](\d))? ?khz\b/.exec(folded);
  if (khz !== null) return Number(khz[2] === undefined ? khz[1] : `${khz[1]}.${khz[2]}`);
  const pair = /\b24 ?[-/] ?(44|48|88|96|176|192)\b|\b(96|192) ?\/ ?24\b/.exec(folded);
  if (pair === null) return null;
  const rate = Number(pair[1] ?? pair[2]);
  return rate === 44 ? 44.1 : rate === 88 ? 88.2 : rate;
}

function formatOf(folded: string): AlbumFormat {
  if (REFUSED.test(folded)) return 'refused';
  if (FLAC.test(folded)) return 'flac';
  if (MP3_320.test(folded)) return 'mp3-320';
  if (MP3.test(folded)) return 'mp3';
  return 'unknown';
}

/** What `title` says of the release. */
export function parseTitle(title: string): TitleFacts {
  const folded = foldTitle(title);
  const depth = /\b(16|24) ?-?bits?\b|\b(16|24) ?[-/] ?(?:44|48|88|96|176|192)\b/.exec(folded);
  return {
    folded,
    words: wordsOf(title),
    format: formatOf(folded),
    bitDepth: depth === null ? null : Number(depth[1] ?? depth[2]),
    sampleRate: sampleRateOf(folded),
    pack: PACK.test(folded),
    markers: MARKERS.filter(([, shows]) => shows.test(folded)).map(([name]) => name),
    editionWords: EDITION.filter(([, shows]) => shows.test(folded)).map(([name]) => name),
  };
}

/** The markers a title carries that the album's own names lack: "Live Through This" is no live album. */
export function foreignMarkers(facts: TitleFacts, ownNames: readonly string[]): string[] {
  const own = ownNames.map(foldTitle).join(' ');
  return facts.markers.filter((marker) => {
    const shows = MARKERS.find(([name]) => name === marker)?.[1];
    return shows === undefined || !shows.test(own);
  });
}

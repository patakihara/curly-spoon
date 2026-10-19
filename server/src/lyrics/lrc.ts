/**
 * Lyric lines from text: LRC's timed lines (`[mm:ss.xx] line`, LRCLIB's `syncedLyrics`), and
 * untimed plain text. A line's `start` is in seconds, null for a plain line. An empty `text` is
 * kept in timed lyrics: it marks an instrumental break.
 */
import { z } from 'zod';

export const lyricLineSchema = z.object({
  start: z.number().finite().nonnegative().nullable(),
  text: z.string(),
});
export type LyricLine = z.infer<typeof lyricLineSchema>;

/**
 * Minutes may pass 59 and take one digit or more, seconds one or two, under 60; a fraction's one
 * to three digits are tenths, hundredths or thousandths. Space may sit between a line's leading
 * tags.
 */
const TIME_TAG = /^\s*\[(\d+):([0-5]?\d)(?:\.(\d{1,3}))?\]/;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i;
/**
 * Enhanced LRC's word tags (`<mm:ss.xx>word`, the fraction optional, seconds under 60), with the
 * space either side; the line keeps its own start. Anything else in angle or square brackets
 * after the leading tags is the song's text.
 */
const WORD_TAG = /(\s?)<\d+:[0-5]\d(?:\.\d{1,3})?>(\s?)/g;
/**
 * No song runs a day: a start past this is not a time, and an offset of a day or more is
 * ignored.
 */
const MAX_MS = 24 * 60 * 60 * 1000;
const BOM = /^\uFEFF/;

function lines(text: string): string[] {
  return text.replace(BOM, '').split(/\r\n|[\n\r\u2028\u2029]/);
}

/** Seconds, to the millisecond. */
function seconds(ms: number): number {
  return Math.round(ms) / 1000;
}

/** A time tag's milliseconds; null when it names no time a song could have. */
function tagMs(tag: RegExpExecArray): number | null {
  const fraction = tag[3] ?? '';
  const fractionMs = fraction === '' ? 0 : Number(fraction) * 10 ** (3 - fraction.length);
  const ms = (Number(tag[1]) * 60 + Number(tag[2])) * 1000 + fractionMs;
  return Number.isFinite(ms) && ms <= MAX_MS ? ms : null;
}

/** A line's words with its word tags taken out, a tag between two spaces leaving one. */
function untagged(rest: string): string {
  return rest.replace(WORD_TAG, (_tag, before: string, after: string) => before || after).trim();
}

/**
 * The timed lines of LRC text, by start. A line with several time tags is sung at each of them;
 * a tag naming no sane time (past a day, before or after the offset) is dropped, and a line left
 * with none is dropped too.
 * A line with no time tag (`[ar:...]`, `[length:...]`, stray text) is dropped. Only the leading
 * run of time tags and well-formed word tags are taken out of a line's text; other bracketed text
 * (`[Chorus]`, `John [3:16] says`) stays as written. `[offset:+ms]` makes every line that many
 * milliseconds earlier, never before 0; an offset of a day or more is ignored. No timed line
 * gives `[]`.
 */
export function parseLrc(text: string): LyricLine[] {
  let offsetMs = 0;
  const timed: { ms: number; text: string }[] = [];
  for (const raw of lines(text)) {
    const line = raw.trim();
    const offset = OFFSET_TAG.exec(line);
    if (offset) {
      const ms = Number(offset[1]);
      if (Math.abs(ms) < MAX_MS) offsetMs = ms;
      continue;
    }
    const at: number[] = [];
    let rest = line;
    for (let tag = TIME_TAG.exec(rest); tag; tag = TIME_TAG.exec(rest)) {
      const ms = tagMs(tag);
      if (ms !== null) at.push(ms);
      rest = rest.slice(tag[0].length);
    }
    const words = untagged(rest);
    for (const ms of at) timed.push({ ms, text: words });
  }
  return timed
    .map((l) => ({ ms: Math.max(0, l.ms - offsetMs), text: l.text }))
    .filter((l) => l.ms <= MAX_MS)
    .sort((a, b) => a.ms - b.ms)
    .map((l) => ({ start: seconds(l.ms), text: l.text }));
}

/** Plain lyrics' lines, untimed, with the empty lines at the end dropped. */
export function plainLines(text: string): LyricLine[] {
  const all = lines(text).map((l) => l.trimEnd());
  while (all.length > 0 && all.at(-1)?.trim() === '') all.pop();
  return all.map((t) => ({ start: null, text: t }));
}

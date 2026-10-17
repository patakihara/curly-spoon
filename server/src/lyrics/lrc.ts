/**
 * Lyric lines from text: LRC's timed lines (`[mm:ss.xx] line`, LRCLIB's `syncedLyrics`), and
 * untimed plain text. A line's `start` is in seconds, null for a plain line. An empty `text` is
 * kept in timed lyrics: it marks an instrumental break.
 */
import { z } from 'zod';

export const lyricLineSchema = z.object({
  start: z.number().nonnegative().nullable(),
  text: z.string(),
});
export type LyricLine = z.infer<typeof lyricLineSchema>;

/** Minutes may pass 59; a fraction's one to three digits are tenths, hundredths or thousandths. */
const TIME_TAG = /^\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]/;
const OFFSET_TAG = /^\[offset:\s*([+-]?\d+)\s*\]$/i;

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** Seconds, to the millisecond. */
function seconds(ms: number): number {
  return Math.round(ms) / 1000;
}

/**
 * The timed lines of LRC text, by start. A line with several time tags is sung at each of them.
 * A line with no time tag (`[ar:...]`, `[length:...]`, stray text) is dropped. `[offset:+ms]`
 * makes every line that many milliseconds earlier, never before 0. No timed line gives `[]`.
 */
export function parseLrc(text: string): LyricLine[] {
  let offsetMs = 0;
  const timed: { ms: number; text: string }[] = [];
  for (const raw of lines(text)) {
    const line = raw.trim();
    const offset = OFFSET_TAG.exec(line);
    if (offset) {
      offsetMs = Number(offset[1]);
      continue;
    }
    const at: number[] = [];
    let rest = line;
    for (let tag = TIME_TAG.exec(rest); tag; tag = TIME_TAG.exec(rest)) {
      const fraction = tag[3] ?? '';
      const fractionMs = fraction === '' ? 0 : Number(fraction) * 10 ** (3 - fraction.length);
      at.push((Number(tag[1]) * 60 + Number(tag[2])) * 1000 + fractionMs);
      rest = rest.slice(tag[0].length);
    }
    for (const ms of at) timed.push({ ms, text: rest.trim() });
  }
  return timed
    .map((l) => ({ ms: Math.max(0, l.ms - offsetMs), text: l.text }))
    .sort((a, b) => a.ms - b.ms)
    .map((l) => ({ start: seconds(l.ms), text: l.text }));
}

/** Plain lyrics' lines, untimed, with the empty lines at the end dropped. */
export function plainLines(text: string): LyricLine[] {
  const all = lines(text).map((l) => l.trimEnd());
  while (all.length > 0 && all.at(-1)?.trim() === '') all.pop();
  return all.map((t) => ({ start: null, text: t }));
}

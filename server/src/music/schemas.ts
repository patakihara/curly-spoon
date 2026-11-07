/**
 * What the extractor (yt-dlp) answers, cut to audio alone. `AudioFormat` has no field for video, so
 * nothing downstream of `parseInfo` can carry a video stream: a format with one is dropped here, and
 * an answer with no audio-only format throws. A stream's URL is held in a `StreamUrl`, which prints
 * as a placeholder wherever it is logged, serialized or given to a client by mistake: it names the
 * household's address and is good for six hours.
 */
import { inspect } from 'node:util';
import { z } from 'zod';

/** A YouTube video id, and all a client may name to the extractor. */
export const YT_ID = /^[\w-]{11}$/;

const STREAM_HOST = /^(?:[a-z0-9-]+\.)+googlevideo\.com$/;

const REDACTED = '<stream url>';

/** A stream may only ever be asked of YouTube's own stream hosts, over https, on the usual port. */
export function isStreamHost(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.port === '' &&
    url.username === '' &&
    url.password === '' &&
    STREAM_HOST.test(url.hostname)
  );
}

/** A stream's address, readable only by asking for it by name. */
export class StreamUrl {
  readonly #href: string;

  constructor(href: string) {
    this.#href = href;
  }

  /** For the one call that asks the upstream. Never logged, stored or sent on. */
  reveal(): string {
    return this.#href;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return REDACTED;
  }
}

export interface AudioFormat {
  itag: number;
  url: StreamUrl;
  /** `audio/webm` or `audio/mp4`, from the URL's own `mime`. */
  mime: string;
  codec: string;
  /** Kilobits a second, when named. */
  abr: number | null;
  /** Bytes, when named. */
  size: number | null;
  /** Milliseconds since the epoch: when the URL stops answering. */
  expiresAt: number;
}

/**
 * Rule 8, on the extractor's own words and the URL's: no video codec, an audio codec, a plain file
 * over https, an audio type, YouTube's stream host, a file rather than a manifest, and the URL asking
 * for the format its row names. Failing rows say nothing of the URL they held.
 */
export const audioFormatSchema = z
  .object({
    format_id: z.string().regex(/^\d+$/),
    vcodec: z.literal('none'),
    acodec: z.string().regex(/^(?:opus|mp4a\.[\w.]+)$/),
    protocol: z.literal('https'),
    url: z.string(),
    abr: z.number().positive().nullish(),
    filesize: z.number().int().positive().nullish(),
  })
  .transform((row, ctx): AudioFormat => {
    const url = URL.canParse(row.url) ? new URL(row.url) : null;
    const mime = url?.searchParams.get('mime') ?? '';
    const expire = Number(url?.searchParams.get('expire') ?? '');
    if (
      url === null ||
      !isStreamHost(url) ||
      url.pathname !== '/videoplayback' ||
      url.searchParams.get('itag') !== row.format_id ||
      !/^audio\/[\w.+-]+$/.test(mime) ||
      !(expire > 0)
    ) {
      ctx.addIssue({ code: 'custom', message: 'not an audio stream on the stream host' });
      return z.NEVER;
    }
    const clen = Number(url.searchParams.get('clen') ?? '');
    return {
      itag: Number(row.format_id),
      url: new StreamUrl(row.url),
      mime,
      codec: row.acodec,
      abr: row.abr ?? null,
      size: row.filesize ?? (Number.isInteger(clen) && clen > 0 ? clen : null),
      expiresAt: expire * 1000,
    };
  });

const infoSchema = z.object({
  id: z.string().regex(YT_ID),
  duration: z.number().nullish(),
  is_live: z.boolean().nullish(),
  live_status: z.string().nullish(),
  formats: z.array(z.unknown()),
});

export interface AudioInfo {
  id: string;
  /** Seconds. */
  duration: number;
  /** Only audio-only formats, in the extractor's order. */
  formats: AudioFormat[];
}

/**
 * An answer that is not understood or holds no audio-only format, or a track that is no song: live,
 * not out yet, or of no length.
 */
export type InfoFailure = 'noAudio' | 'extractorError' | 'live' | 'premiere' | 'noLength';

const LIVE_STATES = new Set(['is_live', 'post_live']);

export class InfoRefused extends Error {
  constructor(readonly reason: InfoFailure) {
    super(`the extractor's answer: ${reason}`);
    this.name = 'InfoRefused';
  }
}

/** The audio-only formats of one `-j` answer. Throws `InfoRefused`, never naming a URL. */
export function parseInfo(raw: unknown): AudioInfo {
  const info = infoSchema.safeParse(raw);
  if (!info.success) throw new InfoRefused('extractorError');
  const { duration, is_live: isLive, live_status: liveStatus } = info.data;
  if (isLive === true || LIVE_STATES.has(liveStatus ?? '')) throw new InfoRefused('live');
  if (liveStatus === 'is_upcoming') throw new InfoRefused('premiere');
  if (duration === undefined || duration === null || duration <= 0) {
    throw new InfoRefused('noLength');
  }
  const formats = info.data.formats.flatMap((row) => {
    const format = audioFormatSchema.safeParse(row);
    return format.success ? [format.data] : [];
  });
  if (formats.length === 0) throw new InfoRefused('noAudio');
  return { id: info.data.id, duration, formats };
}

/** Opus at its best first, then the AAC every player reads. */
const PREFERRED_ITAGS = [251, 250, 140];

/** The format a play uses: the preferred ones in turn, else the highest rate left. */
export function pickFormat(formats: readonly AudioFormat[]): AudioFormat | undefined {
  for (const itag of PREFERRED_ITAGS) {
    const found = formats.find((format) => format.itag === itag);
    if (found !== undefined) return found;
  }
  return [...formats].sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))[0];
}

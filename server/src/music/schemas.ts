/**
 * What the extractor (yt-dlp) and YouTube's player answer, cut to audio alone. `AudioFormat` has no
 * field for video, so nothing downstream of `parseInfo` or `parsePlayer` can carry a video stream: a
 * format with one is dropped here, and an answer with no audio-only format throws. A stream's URL is held in a `StreamUrl`, which prints
 * as a placeholder wherever it is logged, serialized or given to a client by mistake: it names the
 * household's address and is good for six hours.
 */
import { inspect } from 'node:util';
import { z } from 'zod';
import type { PlayerAnswer } from '../adapters/ytmusic/schemas.js';

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

const NOT_AUDIO = 'not an audio stream on the stream host';

/**
 * Rule 8 on a stream URL, the same for yt-dlp's rows and the player's: on the stream host, a file
 * rather than a manifest, asking for format `itag`, naming its own audio type and when it expires.
 * Its type and expiry, or null for any other URL.
 */
function audioStream(
  raw: string,
  itag: string,
): { url: URL; mime: string; expiresAt: number } | null {
  const url = URL.canParse(raw) ? new URL(raw) : null;
  const mime = url?.searchParams.get('mime') ?? '';
  const expire = Number(url?.searchParams.get('expire') ?? '');
  if (
    url === null ||
    !isStreamHost(url) ||
    url.pathname !== '/videoplayback' ||
    url.searchParams.get('itag') !== itag ||
    !/^audio\/[\w.+-]+$/.test(mime) ||
    !(expire > 0)
  ) {
    return null;
  }
  return { url, mime, expiresAt: expire * 1000 };
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
    const stream = audioStream(row.url, row.format_id);
    if (stream === null) {
      ctx.addIssue({ code: 'custom', message: NOT_AUDIO });
      return z.NEVER;
    }
    const clen = Number(stream.url.searchParams.get('clen') ?? '');
    return {
      itag: Number(row.format_id),
      url: new StreamUrl(row.url),
      mime: stream.mime,
      codec: row.acodec,
      abr: row.abr ?? null,
      size: row.filesize ?? (Number.isInteger(clen) && clen > 0 ? clen : null),
      expiresAt: stream.expiresAt,
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

/** `audio/webm; codecs="opus"`: the type, and its one codec. */
const PLAYER_MIME = /^(audio\/[\w.+-]+);\s*codecs="(opus|mp4a\.[\w.]+)"$/;

/**
 * Rule 8 on a player's format row: an audio type with one audio codec, no width, height, frame rate
 * or quality label, a plain URL (a `signatureCipher` row has none, and is dropped), and that URL
 * passing the check yt-dlp's rows pass, its own audio type the one its row names.
 */
export const playerFormatSchema = z
  .object({
    itag: z.number().int().positive(),
    url: z.string(),
    mimeType: z.string().regex(PLAYER_MIME),
    width: z.undefined(),
    height: z.undefined(),
    fps: z.undefined(),
    qualityLabel: z.undefined(),
    averageBitrate: z.number().positive().optional(),
    bitrate: z.number().positive().optional(),
    contentLength: z.string().regex(/^\d+$/).optional(),
  })
  .transform((row, ctx): AudioFormat => {
    const [, type = '', codec = ''] = PLAYER_MIME.exec(row.mimeType) ?? [];
    const stream = audioStream(row.url, String(row.itag));
    if (stream === null || stream.mime !== type) {
      ctx.addIssue({ code: 'custom', message: NOT_AUDIO });
      return z.NEVER;
    }
    const rate = row.averageBitrate ?? row.bitrate;
    return {
      itag: row.itag,
      url: new StreamUrl(row.url),
      mime: type,
      codec,
      abr: rate === undefined ? null : rate / 1000,
      size: row.contentLength === undefined ? null : Number(row.contentLength),
      expiresAt: stream.expiresAt,
    };
  });

/** The player said no: `blocked` for its bot wall, `notPlayable` for any other status. */
export class PlayerRefused extends Error {
  constructor(readonly reason: 'blocked' | 'notPlayable' | 'otherTrack') {
    super(`the player's answer: ${reason}`);
    this.name = 'PlayerRefused';
  }
}

/**
 * The audio-only formats of a player's answer for `id`. Throws `PlayerRefused` for a
 * refusal or another track's answer, and `InfoRefused` as `parseInfo` does, never naming a URL.
 */
export function parsePlayer(answer: PlayerAnswer, id: string): AudioInfo {
  const { status } = answer.playabilityStatus;
  if (status === 'LOGIN_REQUIRED') throw new PlayerRefused('blocked');
  if (status !== 'OK') throw new PlayerRefused('notPlayable');
  const details = answer.videoDetails;
  if (details?.videoId !== id) throw new PlayerRefused('otherTrack');
  if (details.isLive === true) throw new InfoRefused('live');
  const duration = Number(details.lengthSeconds ?? '');
  if (!(duration > 0)) throw new InfoRefused('noLength');
  const streaming = answer.streamingData;
  const rows = [...(streaming?.formats ?? []), ...(streaming?.adaptiveFormats ?? [])];
  const formats = rows.flatMap((row) => {
    const format = playerFormatSchema.safeParse(row);
    return format.success ? [format.data] : [];
  });
  if (formats.length === 0) throw new InfoRefused('noAudio');
  return { id, duration, formats };
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

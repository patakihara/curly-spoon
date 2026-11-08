/**
 * YouTube's own player API, asked as the VISIONOS client: one HTTP call that names a track's
 * formats, each with a plain URL, so no process, JS runtime or signature work stands between a tap
 * and its stream (checked live, 8 Nov 2026: 19 of 19 tracks, about 90 ms). It is exactly the call
 * yt-dlp makes for this client, minus the web page yt-dlp fetches first for a visitor id: here the
 * visitor id comes from a YouTube Music answer instead. Asked with none, it answers
 * `LOGIN_REQUIRED` (checked live).
 *
 * `new YtPlayer({ baseUrl, fetch, timeoutMs? })`, then `player(id, visitorId)`.
 */
import { type FetchLike, requestJson } from '../http/fetch.js';
import { type PlayerAnswer, playerAnswerSchema } from './schemas.js';

export const PLAYER_URL = 'https://www.youtube.com';

/**
 * The client yt-dlp 2026.10.26 names `visionos` (yt_dlp/extractor/youtube/_base.py), copied whole.
 * When YouTube retires it, every play falls back to yt-dlp and the canary's direct result says so;
 * the fix is copying these again from the newest yt-dlp release.
 */
export const VISIONOS = {
  clientName: 'VISIONOS',
  clientVersion: '1.02',
  /** `INNERTUBE_CONTEXT_CLIENT_NAME`, sent as `X-YouTube-Client-Name`. */
  clientNumber: 101,
  deviceMake: 'Apple',
  deviceModel: 'RealityDevice17,1',
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
  osName: 'visionOS',
  osVersion: '26.5.23O471',
} as const;

/** A player answer is about 100 KB; past this it is refused rather than read. */
const PLAYER_MAX_BYTES = 2 * 1024 * 1024;

export interface YtPlayerOptions {
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

export class YtPlayer {
  constructor(private readonly opts: YtPlayerOptions) {}

  /**
   * The player's answer for `id`, as yt-dlp asks it. `visitorId` goes only in its header; null sends
   * none, which only the recorder does, to record the refusal.
   */
  async player(id: string, visitorId: string | null): Promise<PlayerAnswer> {
    const { baseUrl, fetch, timeoutMs } = this.opts;
    const url = new URL('youtubei/v1/player', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('prettyPrint', 'false');
    const { clientNumber, ...client } = VISIONOS;
    return requestJson(
      fetch,
      url.toString(),
      {
        method: 'POST',
        headers: {
          'X-YouTube-Client-Name': String(clientNumber),
          'X-YouTube-Client-Version': VISIONOS.clientVersion,
          Origin: PLAYER_URL,
          'User-Agent': VISIONOS.userAgent,
          ...(visitorId === null ? {} : { 'X-Goog-Visitor-Id': visitorId }),
        },
        json: {
          context: { client: { ...client, hl: 'en', timeZone: 'UTC', utcOffsetMinutes: 0 } },
          videoId: id,
          playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
          contentCheckOk: true,
          racyCheckOk: true,
        },
        maxBytes: PLAYER_MAX_BYTES,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
      },
      playerAnswerSchema,
    );
  }
}

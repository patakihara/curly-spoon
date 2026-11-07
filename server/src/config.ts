import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommitId } from '@auralis/schema';
import { z } from 'zod';
import { AUDIBLE_URL } from './adapters/audible/client.js';
import { AUDNEXUS_URL } from './adapters/audnexus/client.js';
import { isProxyEntry } from './auth/proxy.js';
import { MOST_LIVE_REQUESTS } from './store/requests.js';

/** web's build sits next to server/ in both the repo and the image. */
const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

/** The longest interval a Node timer holds, in whole minutes; a longer one fires after 1 ms. */
const LONGEST_TIMER_MINUTES = Math.floor((2 ** 31 - 1) / 60_000);

/** The longest interval a Node timer holds, in whole seconds. */
const LONGEST_TIMER_SECONDS = Math.floor((2 ** 31 - 1) / 1_000);

/** A whole number of a unit, digits only; blank reads as 0, unset as `fallback`. */
function whole(unit: string, fallback: number, limits: { min: number; max?: number }) {
  const atLeast = z.number().int().min(limits.min);
  const number =
    limits.max === undefined
      ? atLeast
      : atLeast.max(limits.max, `at most ${limits.max} ${unit} (Node's longest timer)`);
  return z
    .string()
    .trim()
    .regex(/^\d*$/, `a whole number of ${unit}, in digits`)
    .transform((value) => (value === '' ? 0 : Number(value)))
    .pipe(number)
    .default(String(fallback));
}

const minutes = (fallback: number, limits: { min: number; max?: number }) =>
  whole('minutes', fallback, limits);

/** An address asked over http or https; a bare `prowlarr:9696` passes as a URL with `prowlarr:` scheme. */
const httpUrl = z
  .string()
  .url()
  .refine((value) => /^https?:$/.test(new URL(value).protocol), 'an http or https URL');

/** A public service's address, with its own by default; empty turns it off. */
const serviceUrl = (fallback: string) => z.union([z.literal(''), httpUrl]).default(fallback);

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATA_DIR: z.string().min(1).default('./data'),
  WEB_DIST_DIR: z.string().min(1).default(DEFAULT_WEB_DIST_DIR),
  // Forwarded headers are believed only from these: IPs, CIDRs or hostnames. Empty trusts none.
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ''),
    )
    .pipe(z.array(z.string().refine(isProxyEntry, 'not an IP, a CIDR or a hostname'))),
  // `auto` marks the cookie Secure whenever the request came in over HTTPS.
  COOKIE_SECURE: z
    .enum(['auto', 'true', 'false'])
    .default('auto')
    .transform((value) => (value === 'auto' ? value : value === 'true')),
  // The origin browsers load the app from; a signed-in write from any other is refused.
  PUBLIC_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && url.pathname === '/' && !url.search && !url.hash;
    }, 'an http or https origin with no path')
    .transform((value) => new URL(value).origin)
    .optional(),
  // The household sign-on. With an issuer, the client secret file and PUBLIC_ORIGIN are required.
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).default('auralis'),
  OIDC_CLIENT_SECRET_FILE: z.string().min(1).optional(),
  // Each upstream, with the file its admin-level key is in.
  ABS_URL: z.string().url().optional(),
  ABS_PROVISION_KEY_FILE: z.string().min(1).optional(),
  JELLYFIN_URL: z.string().url().optional(),
  JELLYFIN_API_KEY_FILE: z.string().min(1).optional(),
  // The library index: how often it runs (0 turns it off), and the file holding Auralis's own
  // listen-only Audiobookshelf key, which it reads the libraries with. Jellyfin's key is above.
  INDEX_EVERY_MINUTES: minutes(60, { min: 0, max: LONGEST_TIMER_MINUTES }),
  ABS_API_KEY_FILE: z.string().min(1).optional(),
  // The lyrics backfill: how often it runs (0 turns it off), and LRCLIB, the public lyrics
  // service it and the lyrics route ask, keyless; empty turns LRCLIB off.
  LYRICS_EVERY_MINUTES: minutes(60, { min: 0, max: LONGEST_TIMER_MINUTES }),
  LRCLIB_URL: serviceUrl('https://lrclib.net'),
  // The request job: how often it moves each request a step, how long an imported item may stay
  // out of the index before its request fails, how long any one upstream step may go unanswered,
  // how long a download may stand still, how long an unreachable upstream may hold a request, and how
  // many live requests of all media one person may be on.
  REQUESTS_EVERY_SECONDS: whole('seconds', 30, { min: 1, max: LONGEST_TIMER_SECONDS }),
  REQUEST_NOT_INDEXED_HOURS: whole('hours', 24, { min: 1 }),
  REQUEST_STEP_TIMEOUT_SECONDS: whole('seconds', 120, { min: 1, max: LONGEST_TIMER_SECONDS }),
  REQUEST_STALL_MINUTES: minutes(15, { min: 1 }),
  REQUEST_HOLD_MINUTES: minutes(60, { min: 1 }),
  REQUESTS_MAX_LIVE: whole('requests', MOST_LIVE_REQUESTS, { min: 1 }),
  // Book requests, each optional: without them books cannot be requested and all else runs. The
  // indexers and the torrent client with their keys' files; the folder holding Books and Downloads,
  // on one mount so a link holds; where qBittorrent itself sees Downloads; and the two public
  // catalogues, keyless, where empty finds no books at all or leaves them without a photo.
  PROWLARR_URL: httpUrl.optional(),
  PROWLARR_API_KEY_FILE: z.string().min(1).optional(),
  QBITTORRENT_URL: httpUrl.optional(),
  QBITTORRENT_API_KEY_FILE: z.string().min(1).optional(),
  QBITTORRENT_DOWNLOADS_PATH: z.string().min(1).optional(),
  MEDIA_DIR: z.string().min(1).optional(),
  AUDIBLE_URL: serviceUrl(AUDIBLE_URL),
  AUDNEXUS_URL: serviceUrl(AUDNEXUS_URL),
  // How long a transcode may go unasked-for before Auralis closes it upstream.
  PLAY_IDLE_MINUTES: minutes(10, { min: 1 }),
  // The most a streamed song's held bytes may take on disk, about 500 songs by default.
  STREAM_CACHE_MIB: whole('MiB', 2048, { min: 1 }),
  // The extractor the image brings, under a folder named for its version; unset, nothing streams.
  // The song its daily canary checks, and the search that should find it.
  EXTRACTOR_PATH: z.string().min(1).optional(),
  YTMUSIC_CANARY_ID: z
    .string()
    .regex(/^[\w-]{11}$/)
    .default('lYBUbBu4W08'),
  YTMUSIC_CANARY_QUERY: z.string().min(1).default('Never Gonna Give You Up Rick Astley'),
  // The key that encrypts each person's upstream tokens: base64 here, or a 0600 file.
  SECRET_KEY: z.string().min(1).optional(),
  SECRET_KEY_FILE: z.string().min(1).optional(),
  // The commit the image was built from, set by its build; empty or unset outside an image.
  AURALIS_COMMIT: z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(CommitId.optional()),
});

export type CookieSecure = 'auto' | boolean;

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  webDistDir: string;
  trustProxy: string[];
  cookieSecure: CookieSecure;
  publicOrigin: string | undefined;
  oidc: OidcConfig | null;
  abs: UpstreamConfig | null;
  jellyfin: UpstreamConfig | null;
  index: IndexConfig;
  lyrics: LyricsConfig;
  requests: RequestsConfig;
  books: BooksConfig;
  /** Minutes a transcode may go unasked-for before it is closed upstream. */
  playIdleMinutes: number;
  /** The extractor the image brings, and the song its canary checks. */
  ytmusic: { extractorPath: string | null; canaryId: string; canaryQuery: string };
  /** MiB the capped disk cache of streamed songs may hold. */
  streamCacheMib: number;
  secretKey: string | undefined;
  secretKeyFile: string;
  commit: string | null;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecretFile: string;
  redirectUri: string;
}

export interface IndexConfig {
  /** 0 when the index job is off. */
  everyMinutes: number;
  /** The listen-only Audiobookshelf key's file; without it, Audiobookshelf is not indexed. */
  absKeyFile: string | null;
}

export interface LyricsConfig {
  /** 0 when the lyrics backfill is off. */
  everyMinutes: number;
  /** Null when LRCLIB is switched off. */
  lrclibUrl: string | null;
}

export interface RequestsConfig {
  everySeconds: number;
  /** How long an imported item may stay out of the index before its request fails. */
  notIndexedAfterHours: number;
  /** How long any one call to a medium's steps may go unanswered before it counts as failed. */
  stepTimeoutSeconds: number;
  /** How long a download's bytes may stand still before its request fails. */
  stallAfterMinutes: number;
  /** How long an upstream that cannot be reached may hold a request before it fails. */
  holdAfterMinutes: number;
  /** How many live requests of all media one person may be on. */
  maxLive: number;
}

export interface UpstreamConfig {
  url: string;
  keyFile: string;
}

/** What book requests need. Unlike an upstream's, a part missing here is no reason not to start. */
export interface BooksConfig {
  prowlarr: UpstreamConfig | null;
  qbittorrent: UpstreamConfig | null;
  /** Where qBittorrent itself sees Downloads. */
  downloadsPath: string | null;
  /** The folder holding Books and Downloads. */
  mediaDir: string | null;
  /** Null when Audible is switched off. */
  audibleUrl: string | null;
  /** Null when Audnexus is switched off. */
  audnexusUrl: string | null;
}

const bothOrNull = (url: string | undefined, keyFile: string | undefined) =>
  url === undefined || keyFile === undefined ? null : { url, keyFile };

function required<T>(value: T | undefined, name: string, because: string): T {
  if (value === undefined) throw new Error(`${name} is required ${because}`);
  return value;
}

function upstream(
  url: string | undefined,
  keyFile: string | undefined,
  keyName: string,
  urlName: string,
) {
  if (url === undefined) return null;
  return { url, keyFile: required(keyFile, keyName, `with ${urlName}`) };
}

/** Fails fast at boot: a server started with a malformed environment should not start at all. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    dataDir: parsed.DATA_DIR,
    webDistDir: parsed.WEB_DIST_DIR,
    trustProxy: parsed.TRUST_PROXY,
    cookieSecure: parsed.COOKIE_SECURE,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    oidc:
      parsed.OIDC_ISSUER === undefined
        ? null
        : {
            issuer: parsed.OIDC_ISSUER,
            clientId: parsed.OIDC_CLIENT_ID,
            clientSecretFile: required(
              parsed.OIDC_CLIENT_SECRET_FILE,
              'OIDC_CLIENT_SECRET_FILE',
              'with OIDC_ISSUER',
            ),
            redirectUri: `${required(parsed.PUBLIC_ORIGIN, 'PUBLIC_ORIGIN', 'with OIDC_ISSUER')}/api/auth/callback`,
          },
    abs: upstream(
      parsed.ABS_URL,
      parsed.ABS_PROVISION_KEY_FILE,
      'ABS_PROVISION_KEY_FILE',
      'ABS_URL',
    ),
    jellyfin: upstream(
      parsed.JELLYFIN_URL,
      parsed.JELLYFIN_API_KEY_FILE,
      'JELLYFIN_API_KEY_FILE',
      'JELLYFIN_URL',
    ),
    index: {
      everyMinutes: parsed.INDEX_EVERY_MINUTES,
      absKeyFile:
        parsed.ABS_API_KEY_FILE === undefined
          ? null
          : (required(parsed.ABS_URL, 'ABS_URL', 'with ABS_API_KEY_FILE'), parsed.ABS_API_KEY_FILE),
    },
    lyrics: {
      everyMinutes: parsed.LYRICS_EVERY_MINUTES,
      lrclibUrl: parsed.LRCLIB_URL === '' ? null : parsed.LRCLIB_URL,
    },
    requests: {
      everySeconds: parsed.REQUESTS_EVERY_SECONDS,
      notIndexedAfterHours: parsed.REQUEST_NOT_INDEXED_HOURS,
      stepTimeoutSeconds: parsed.REQUEST_STEP_TIMEOUT_SECONDS,
      stallAfterMinutes: parsed.REQUEST_STALL_MINUTES,
      holdAfterMinutes: parsed.REQUEST_HOLD_MINUTES,
      maxLive: parsed.REQUESTS_MAX_LIVE,
    },
    books: {
      prowlarr: bothOrNull(parsed.PROWLARR_URL, parsed.PROWLARR_API_KEY_FILE),
      qbittorrent: bothOrNull(parsed.QBITTORRENT_URL, parsed.QBITTORRENT_API_KEY_FILE),
      downloadsPath: parsed.QBITTORRENT_DOWNLOADS_PATH ?? null,
      mediaDir: parsed.MEDIA_DIR ?? null,
      audibleUrl: parsed.AUDIBLE_URL === '' ? null : parsed.AUDIBLE_URL,
      audnexusUrl: parsed.AUDNEXUS_URL === '' ? null : parsed.AUDNEXUS_URL,
    },
    playIdleMinutes: parsed.PLAY_IDLE_MINUTES,
    streamCacheMib: parsed.STREAM_CACHE_MIB,
    ytmusic: {
      extractorPath: parsed.EXTRACTOR_PATH ?? null,
      canaryId: parsed.YTMUSIC_CANARY_ID,
      canaryQuery: parsed.YTMUSIC_CANARY_QUERY,
    },
    secretKey: parsed.SECRET_KEY,
    secretKeyFile: parsed.SECRET_KEY_FILE ?? join(parsed.DATA_DIR, 'secret.key'),
    commit: parsed.AURALIS_COMMIT ?? null,
  };
}

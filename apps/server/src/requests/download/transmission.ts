/**
 * Transmission RPC client.
 *
 * The whole thing hinges on the CSRF-style session-id dance: the *first* request to the RPC
 * endpoint always comes back **HTTP 409** carrying an `X-Transmission-Session-Id` response
 * header, and the correct move is to capture that header, resend the *identical* request
 * with it set as a request header, and cache it for later calls. The id can rotate later
 * (Transmission restarts, or just times it out), which shows up as a 409 on a call that
 * previously worked — so any 409, not just the first, triggers exactly one
 * capture-and-retry. A second 409 in a row is treated as a real failure rather than another
 * retry, so a genuinely broken RPC endpoint can't turn into a retry loop.
 */

import { z } from 'zod';
import type {
  AddDownloadOptions,
  DownloadClientFactory,
  DownloadState,
  DownloadStatus,
  Release,
} from '../types.js';
import { ProviderError } from '../types.js';
import { infoHashFromMagnet } from './torrentId.js';

const PROVIDER_ID = 'transmission';
const RPC_PATH = '/transmission/rpc';
const SESSION_HEADER = 'X-Transmission-Session-Id';

const secretSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const rpcEnvelopeSchema = z.object({
  result: z.string(),
  arguments: z.unknown().optional().default({}),
});

const addedTorrentSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  hashString: z.string().optional(),
});

const torrentAddArgumentsSchema = z.object({
  'torrent-added': addedTorrentSchema.optional(),
  'torrent-duplicate': addedTorrentSchema.optional(),
});

const torrentGetItemSchema = z.object({
  hashString: z.string(),
  name: z.string().optional().default(''),
  percentDone: z.number(),
  status: z.number(),
  downloadDir: z.string().optional().default(''),
  rateDownload: z.number(),
  eta: z.number(),
  errorString: z.string().optional().default(''),
});

const torrentGetArgumentsSchema = z.object({
  torrents: z.array(torrentGetItemSchema),
});

/**
 * Transmission's numeric `status` field, from its RPC spec:
 * 0 stopped, 1 queued-to-check, 2 checking, 3 queued-to-download, 4 downloading,
 * 5 queued-to-seed, 6 seeding.
 */
function mapState(
  status: number,
  percentDone: number,
  errorString: string,
): { state: DownloadState; errorMessage: string | null } {
  if (errorString) {
    return { state: 'error', errorMessage: errorString };
  }
  if (status === 0) {
    // Stopped with nothing left to fetch means finished, exactly like qBittorrent's
    // pausedUP/stoppedUP — a stopped-but-incomplete torrent is a genuine pause.
    return percentDone >= 1
      ? { state: 'completed', errorMessage: null }
      : { state: 'paused', errorMessage: null };
  }
  if (status === 1 || status === 2 || status === 3 || status === 5) {
    return { state: 'queued', errorMessage: null };
  }
  if (status === 4) {
    return { state: 'downloading', errorMessage: null };
  }
  if (status === 6) {
    return { state: 'seeding', errorMessage: null };
  }
  return { state: 'error', errorMessage: `Transmission reported unrecognised status ${status}` };
}

export const createTransmissionClient: DownloadClientFactory = ({ config, fetch }) => {
  const baseUrl = config.baseUrl;
  let sessionId: string | null = null;

  function parseSecret(): { username: string; password: string } | null {
    // Unlike qBittorrent, Transmission is commonly run unauthenticated on a LAN, so an
    // absent secret is a normal configuration, not an error — only a missing base URL is.
    if (!config.secret) return null;
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(config.secret);
    } catch {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'Transmission credentials are not valid JSON.',
      );
    }
    const result = secretSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'Transmission credentials are missing username/password.',
      );
    }
    return result.data;
  }

  function authHeader(): string | null {
    const creds = parseSecret();
    if (!creds) return null;
    const encoded = Buffer.from(`${creds.username}:${creds.password}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }

  /**
   * One RPC call, handling the session-id handshake. Sends with whatever session id is
   * cached (possibly none, on the very first call); on 409 it captures the fresh id from
   * the response header and retries once with it. A second 409 is a real failure.
   */
  async function rpc(
    method: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!baseUrl) {
      throw new ProviderError('unauthorized', PROVIDER_ID, 'Transmission requires a base URL.');
    }
    const bearer = authHeader();
    const bodyText = JSON.stringify({ method, arguments: args });

    const attempt = async (): Promise<Response> => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (sessionId) headers.set(SESSION_HEADER, sessionId);
      if (bearer) headers.set('Authorization', bearer);
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${RPC_PATH}`, {
          method: 'POST',
          headers,
          body: bodyText,
          signal,
        });
      } catch (cause) {
        throw new ProviderError(
          'unreachable',
          PROVIDER_ID,
          `Could not reach Transmission at ${baseUrl}${RPC_PATH}.`,
          { cause },
        );
      }
      return response;
    };

    let response = await attempt();
    if (response.status === 409) {
      const fresh = response.headers.get(SESSION_HEADER);
      if (!fresh) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          'Transmission returned 409 without a session id header.',
        );
      }
      sessionId = fresh;
      response = await attempt();
      if (response.status === 409) {
        throw new ProviderError(
          'unreachable',
          PROVIDER_ID,
          'Transmission kept rejecting the session id after a fresh handshake.',
        );
      }
    }

    if (response.status === 401) {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'Transmission rejected the configured credentials.',
      );
    }
    if (response.status === 404) {
      throw new ProviderError(
        'not_found',
        PROVIDER_ID,
        `Transmission RPC endpoint not found at ${RPC_PATH}.`,
      );
    }
    if (!response.ok) {
      throw new ProviderError(
        'rejected',
        PROVIDER_ID,
        `Transmission RPC "${method}" failed with status ${response.status}.`,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new ProviderError(
        'bad_response',
        PROVIDER_ID,
        'Transmission returned unparseable JSON.',
        { cause },
      );
    }
    const envelope = rpcEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new ProviderError(
        'bad_response',
        PROVIDER_ID,
        'Transmission RPC response failed validation.',
        {
          cause: envelope.error,
        },
      );
    }
    if (envelope.data.result !== 'success') {
      throw new ProviderError('rejected', PROVIDER_ID, envelope.data.result);
    }
    return envelope.data.arguments;
  }

  return {
    id: PROVIDER_ID,
    displayName: 'Transmission',

    async add(
      release: Release,
      options: AddDownloadOptions,
      signal?: AbortSignal,
    ): Promise<string> {
      const filename = release.magnetUri ?? release.downloadUrl;
      if (!filename) {
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          `Release "${release.title}" carried neither a magnet nor a download URL — nothing to add.`,
        );
      }

      const args: Record<string, unknown> = { filename, paused: false };
      if (options.savePath !== null) args['download-dir'] = options.savePath;
      // Labels have been supported since Transmission 3.0; older servers simply ignore an
      // argument they don't recognise, so sending it unconditionally is harmless.
      if (options.category !== null) args.labels = [options.category];

      const rawArgs = await rpc('torrent-add', args, signal);
      const parsed = torrentAddArgumentsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          'Transmission torrent-add response failed validation.',
          {
            cause: parsed.error,
          },
        );
      }

      // A duplicate is treated as success — asking Auralis to grab a book it already has
      // queued should not surface as an error to whoever clicked "request" a second time.
      const added = parsed.data['torrent-added'] ?? parsed.data['torrent-duplicate'];
      if (added?.hashString) {
        return added.hashString.toLowerCase();
      }

      if (release.magnetUri) {
        const fallback = infoHashFromMagnet(release.magnetUri);
        if (fallback) return fallback;
      }

      throw new ProviderError(
        'bad_response',
        PROVIDER_ID,
        'Transmission accepted the torrent but reported no hash for it.',
      );
    },

    async status(handle: string, signal?: AbortSignal): Promise<DownloadStatus> {
      const rawArgs = await rpc(
        'torrent-get',
        {
          ids: [handle],
          fields: [
            'hashString',
            'name',
            'percentDone',
            'status',
            'downloadDir',
            'rateDownload',
            'eta',
            'errorString',
          ],
        },
        signal,
      );
      const parsed = torrentGetArgumentsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          'Transmission torrent-get response failed validation.',
          {
            cause: parsed.error,
          },
        );
      }

      if (parsed.data.torrents.length === 0) {
        return {
          clientId: PROVIDER_ID,
          handle,
          state: 'missing',
          progress: 0,
          contentPath: null,
          downloadRateBytes: 0,
          etaSeconds: null,
          errorMessage: null,
        };
      }

      // Non-null: the `length === 0` case returned above, so a value is present here.
      const info = parsed.data.torrents[0]!;
      const { state, errorMessage } = mapState(info.status, info.percentDone, info.errorString);
      const etaSeconds = info.eta < 0 ? null : info.eta;

      return {
        clientId: PROVIDER_ID,
        handle: info.hashString.toLowerCase(),
        state,
        progress: Math.min(1, Math.max(0, info.percentDone)),
        contentPath: info.downloadDir || null,
        downloadRateBytes: info.rateDownload,
        etaSeconds,
        errorMessage,
      };
    },

    async remove(handle: string, deleteData: boolean, signal?: AbortSignal): Promise<void> {
      // Transmission's torrent-remove is a no-op success for an id it doesn't recognise —
      // there's no separate "unknown id" error to special-case, unlike qBittorrent's 404.
      await rpc('torrent-remove', { ids: [handle], 'delete-local-data': deleteData }, signal);
    },

    async testConnection(signal?: AbortSignal): Promise<void> {
      await rpc('session-get', {}, signal);
    },
  };
};

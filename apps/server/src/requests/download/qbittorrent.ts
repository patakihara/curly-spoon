/**
 * qBittorrent WebUI API v2 client.
 *
 * The one thing worth getting right here is session handling. `POST /api/v2/auth/login`
 * answers **HTTP 200 for both success and failure** — a bad password comes back as body
 * `Fails.` with a 200 status, so status alone tells you nothing and the body must be
 * checked. On success a `SID` cookie arrives via `set-cookie`; we cache it in this closure
 * and log in *lazily* — only when we have no SID yet, or when a call comes back 403
 * ("session expired"). A 403 triggers exactly one re-login-and-retry; a second 403 is a
 * hard `unauthorized`. Retrying more than once against an auth endpoint is how a WebUI ends
 * up banning the calling IP, so the single-retry ceiling is deliberate, not an oversight.
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
import { infoHashFromMagnet, infoHashFromTorrentFile } from './torrentId.js';

const PROVIDER_ID = 'qbittorrent';

const secretSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const torrentInfoSchema = z.object({
  hash: z.string(),
  state: z.string(),
  progress: z.number(),
  content_path: z.string().optional().default(''),
  save_path: z.string().optional().default(''),
  dlspeed: z.number(),
  eta: z.number(),
  name: z.string().optional().default(''),
});

const torrentInfoListSchema = z.array(torrentInfoSchema);

/** qBittorrent's "infinity" sentinel for ETA — a hundred-day countdown is worse than nothing. */
const ETA_INFINITY_SENTINEL = 8640000;

const DOWNLOADING_STATES = new Set([
  'downloading',
  'metaDL',
  'forcedDL',
  'checkingDL',
  'allocating',
  'stalledDL',
]);
const QUEUED_STATES = new Set(['queuedDL', 'queuedUP', 'checkingResumeData', 'moving']);
const SEEDING_STATES = new Set(['uploading', 'forcedUP', 'stalledUP', 'checkingUP']);
const PAUSED_STATES = new Set(['pausedDL', 'stoppedDL']);
// Paused *after* finishing means finished, not paused — this is what tells the request
// pipeline the file is actually ready to hand to Audiobookshelf. Newer qBittorrent renamed
// `pausedUP` to `stoppedUP`; both spellings are handled so the mapping survives the rename.
const COMPLETED_STATES = new Set(['pausedUP', 'stoppedUP']);
const ERROR_STATES = new Set(['error', 'missingFiles', 'unknown']);

function mapState(raw: string): { state: DownloadState; errorMessage: string | null } {
  if (DOWNLOADING_STATES.has(raw)) return { state: 'downloading', errorMessage: null };
  if (QUEUED_STATES.has(raw)) return { state: 'queued', errorMessage: null };
  // Kept distinct from 'completed': the request pipeline treats both 'seeding' and
  // 'completed' as "the bytes are on disk", so collapsing seeding into completed here
  // would not change pipeline behaviour, only throw away information a settings/status
  // screen might want to show (still uploading vs. fully done).
  if (SEEDING_STATES.has(raw)) return { state: 'seeding', errorMessage: null };
  if (PAUSED_STATES.has(raw)) return { state: 'paused', errorMessage: null };
  if (COMPLETED_STATES.has(raw)) return { state: 'completed', errorMessage: null };
  if (ERROR_STATES.has(raw))
    return { state: 'error', errorMessage: `qBittorrent reported state "${raw}"` };
  // Unrecognised is pessimistic on purpose: silently mapping an unknown future state to a
  // happy one would hide a real failure from the user.
  return { state: 'error', errorMessage: `Unrecognised qBittorrent state "${raw}"` };
}

export const createQbittorrentClient: DownloadClientFactory = ({ config, fetch }) => {
  const baseUrl = config.baseUrl;
  let sid: string | null = null;

  function parseSecret(): { username: string; password: string } {
    if (!baseUrl) {
      throw new ProviderError('unauthorized', PROVIDER_ID, 'qBittorrent requires a base URL.');
    }
    if (!config.secret) {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'qBittorrent requires WebUI credentials to be configured.',
      );
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(config.secret);
    } catch {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'qBittorrent credentials are not valid JSON.',
      );
    }
    const result = secretSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'qBittorrent credentials are missing username/password.',
      );
    }
    return result.data;
  }

  async function doFetch(path: string, init: RequestInit): Promise<Response> {
    const url = `${baseUrl}${path}`;
    try {
      return await fetch(url, init);
    } catch (cause) {
      throw new ProviderError(
        'unreachable',
        PROVIDER_ID,
        `Could not reach qBittorrent at ${url}.`,
        {
          cause,
        },
      );
    }
  }

  function extractSid(response: Response): string | null {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = /SID=([^;]+)/u.exec(setCookie);
    // The capture group is non-optional in the pattern above, so a successful match always
    // has it.
    return match ? match[1]! : null;
  }

  async function login(signal?: AbortSignal): Promise<void> {
    const { username, password } = parseSecret();
    const body = new URLSearchParams({ username, password }).toString();
    const response = await doFetch('/api/v2/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal,
    });
    if (!response.ok) {
      throw new ProviderError(
        'unreachable',
        PROVIDER_ID,
        `qBittorrent login failed with status ${response.status}.`,
      );
    }
    const text = await response.text();
    if (text.trim() !== 'Ok.') {
      throw new ProviderError(
        'unauthorized',
        PROVIDER_ID,
        'qBittorrent rejected the configured credentials.',
      );
    }
    const newSid = extractSid(response);
    if (!newSid) {
      throw new ProviderError(
        'bad_response',
        PROVIDER_ID,
        'qBittorrent login succeeded but returned no session cookie.',
      );
    }
    sid = newSid;
  }

  /**
   * Runs one authenticated call, logging in first if there is no cached session, and
   * retrying exactly once — after a fresh login — if the call comes back 403. A second 403
   * is a hard failure rather than another retry: looping against an auth endpoint is how a
   * WebUI ends up IP-banning the caller.
   */
  async function authedFetch(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<Response> {
    if (!sid) {
      await login(signal);
    }
    const attempt = async (): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set('Cookie', `SID=${sid}`);
      return doFetch(path, { ...init, headers, signal });
    };

    let response = await attempt();
    if (response.status === 403) {
      await login(signal);
      response = await attempt();
      if (response.status === 403) {
        throw new ProviderError(
          'unauthorized',
          PROVIDER_ID,
          'qBittorrent session expired repeatedly.',
        );
      }
    }
    return response;
  }

  function assertOkStatus(response: Response, context: string): void {
    if (response.status === 404) {
      throw new ProviderError('not_found', PROVIDER_ID, `qBittorrent: ${context} not found.`);
    }
    if (!response.ok) {
      throw new ProviderError(
        'rejected',
        PROVIDER_ID,
        `qBittorrent: ${context} failed with status ${response.status}.`,
      );
    }
  }

  return {
    id: PROVIDER_ID,
    displayName: 'qBittorrent',

    async add(
      release: Release,
      options: AddDownloadOptions,
      signal?: AbortSignal,
    ): Promise<string> {
      // The handle is derived once, up front, so it can both drive the add request and be
      // the return value — fetching the .torrent bytes a second time just to re-derive the
      // hash would double the network cost for no reason.
      const magnetHash = release.magnetUri ? infoHashFromMagnet(release.magnetUri) : null;
      let torrentBytes: Uint8Array | null = null;
      let handle = magnetHash;

      if (!handle && release.downloadUrl) {
        torrentBytes = await fetchTorrentBytes(release.downloadUrl, fetch, signal);
        handle = infoHashFromTorrentFile(torrentBytes);
      }
      if (!handle) {
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          `Release "${release.title}" carried neither a usable magnet nor a fetchable .torrent — nothing to add.`,
        );
      }

      let response: Response;
      if (magnetHash && release.magnetUri) {
        const params = new URLSearchParams({ urls: release.magnetUri });
        if (options.savePath !== null) params.set('savepath', options.savePath);
        if (options.category !== null) params.set('category', options.category);
        response = await authedFetch(
          '/api/v2/torrents/add',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
          },
          signal,
        );
      } else {
        // handle came from torrentBytes above, so it is guaranteed non-null here.
        const form = new FormData();
        form.set('torrents', new Blob([torrentBytes!]), 'upload.torrent');
        if (options.savePath !== null) form.set('savepath', options.savePath);
        if (options.category !== null) form.set('category', options.category);
        // No manual Content-Type here: fetch computes the multipart boundary itself, and
        // setting it by hand produces a boundary mismatch the server can't parse.
        response = await authedFetch(
          '/api/v2/torrents/add',
          { method: 'POST', body: form },
          signal,
        );
      }

      assertOkStatus(response, 'add');
      const text = await response.text();
      if (text.trim() !== 'Ok.') {
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          'qBittorrent declined to add the torrent.',
        );
      }

      return handle;
    },

    async status(handle: string, signal?: AbortSignal): Promise<DownloadStatus> {
      const response = await authedFetch(
        `/api/v2/torrents/info?${new URLSearchParams({ hashes: handle }).toString()}`,
        { method: 'GET' },
        signal,
      );
      assertOkStatus(response, 'status');

      let json: unknown;
      try {
        json = await response.json();
      } catch (cause) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          'qBittorrent returned unparseable JSON.',
          {
            cause,
          },
        );
      }
      const parsed = torrentInfoListSchema.safeParse(json);
      if (!parsed.success) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          'qBittorrent status response failed validation.',
          {
            cause: parsed.error,
          },
        );
      }

      if (parsed.data.length === 0) {
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
      const info = parsed.data[0]!;
      const { state, errorMessage } = mapState(info.state);
      const contentPath = info.content_path || info.save_path || null;
      const etaSeconds = info.eta >= ETA_INFINITY_SENTINEL ? null : info.eta;

      return {
        clientId: PROVIDER_ID,
        handle: info.hash.toLowerCase(),
        state,
        progress: Math.min(1, Math.max(0, info.progress)),
        contentPath: contentPath || null,
        downloadRateBytes: info.dlspeed,
        etaSeconds,
        errorMessage,
      };
    },

    async remove(handle: string, deleteData: boolean, signal?: AbortSignal): Promise<void> {
      const body = new URLSearchParams({
        hashes: handle,
        deleteFiles: String(deleteData),
      }).toString();
      const response = await authedFetch(
        '/api/v2/torrents/delete',
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
        signal,
      );
      // A handle qBittorrent doesn't recognise is not an error - it's already gone, which
      // is the state `remove` is trying to reach anyway.
      if (response.status === 404) return;
      assertOkStatus(response, 'remove');
    },

    async testConnection(signal?: AbortSignal): Promise<void> {
      const response = await authedFetch('/api/v2/app/version', { method: 'GET' }, signal);
      assertOkStatus(response, 'testConnection');
    },
  };
};

async function fetchTorrentBytes(
  url: string,
  fetchFn: (input: string, init?: RequestInit) => Promise<Response>,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: 'GET', signal });
  } catch (cause) {
    throw new ProviderError('unreachable', PROVIDER_ID, `Could not fetch .torrent from ${url}.`, {
      cause,
    });
  }
  if (!response.ok) {
    throw new ProviderError(
      'rejected',
      PROVIDER_ID,
      `Fetching .torrent from ${url} failed with status ${response.status}.`,
    );
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

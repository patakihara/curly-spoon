/**
 * slskd client and `MusicRequestProvider` — the reference music-request provider (see
 * `docs/HANDOVER.md` §3: "slskd, not deemix" — deemix is unmaintained; the provider
 * interface is pluggable, so deemix or anything else is a new file, not a refactor).
 *
 * Every claim below is read directly from `github.com/slskd/slskd`'s own source (house
 * rule: verify against source, never recall) — file paths are exact, not paraphrased:
 *
 *  - **Auth**: `X-API-Key: <key>` header, checked by
 *    `src/slskd/Common/Authentication/ApiKeyAuthentication.cs`'s
 *    `ApiKeyAuthenticationHandler.HandleAuthenticateAsync` (`Request.Headers.TryGetValue
 *    ("X-API-Key", ...)`). A bearer token also works there (the JWT handler falls back to
 *    API-key auth for a non-JWT bearer value — `Program.cs`'s `JwtBearerEvents
 *    .OnMessageReceived`), but the dedicated header is what every other route uses to
 *    authenticate here (`[Authorize(Policy = AuthPolicy.Any)]` on every endpoint this file
 *    calls), so it is what this client sends.
 *  - **Search is asynchronous**, not request/response: `POST /api/v0/searches`
 *    (`src/slskd/Search/API/Controllers/SearchesController.cs::Post`) starts a search and
 *    returns immediately with a `Search` record (`src/slskd/Search/Types/Search.cs`) whose
 *    `state` has not yet reached `Completed` — `Search.IsComplete` is literally
 *    `State.HasFlag(SearchStates.Completed)`. The caller polls
 *    `GET /api/v0/searches/{id}` until that flips, then reads
 *    `GET /api/v0/searches/{id}/responses` for the actual file listings.
 *  - **A search response is per online peer, not per file**, and carries no
 *    seeders/leechers concept at all: `src/slskd/Search/Types/Response.cs` groups a
 *    `Username`, `QueueLength`, `UploadSpeed`, `HasFreeUploadSlot` and a list of `Files`
 *    (`src/slskd/Search/Types/File.cs`: `Filename`, `Size`, `BitRate`, `Extension`, ...).
 *    Soulseek is not a swarm protocol, which is exactly why `../types.ts`'s
 *    `MusicCandidate` has no `seeders`/`leechers` fields to fake — see that file's comment.
 *  - **Enqueue**: `POST /api/v0/transfers/downloads/batches`
 *    (`src/slskd/Transfers/API/Controllers/TransfersController.cs::EnqueueBatchAsync`, body
 *    shape in `.../DTO/EnqueueDownloadBatchRequest.cs`) takes
 *    `{ username, files: [{ filename, size }], options: { destination } }` and returns
 *    `{ batch: { transfers: [...] }, failures: [...] }`; each created `Transfer`
 *    (`src/slskd/Transfers/Types/Transfer.cs`) has its own `id`. The older single-file
 *    `POST /transfers/downloads/{username}` in the same controller is marked
 *    `[Obsolete("Will be phased out in future versions; use batches")]` — not used here.
 *  - **Status**: `GET /api/v0/transfers/downloads/{username}/{id}` returns that `Transfer`.
 *    `state` arrives as a **string**, not a number: `Program.cs` registers a
 *    `JsonStringEnumConverter` globally on the controller JSON options
 *    (`services.AddControllers(...).AddJsonOptions(o => o.JsonSerializerOptions.Converters
 *    .Add(new JsonStringEnumConverter()))`), and `TransferStates` is a `[Flags]` enum
 *    (defined in the `Soulseek` package this repo depends on), so a combined state
 *    serialises as a comma-joined flag-name list (e.g. `"Completed, Succeeded"`), never a
 *    single token. The category groupings below mirror
 *    `src/slskd/Transfers/Types/TransferStateCategories.cs` exactly, flag name for flag
 *    name.
 *  - **Remove**: `DELETE /api/v0/transfers/downloads/{username}/{id}?remove=true` — but this
 *    only drops slskd's own tracking record. Nothing in `TransfersController.cs` deletes the
 *    downloaded bytes from disk; there is no such endpoint anywhere in this controller.
 *    `remove()`'s `deleteData` is honoured only to that extent — see its doc comment below.
 *  - **`testConnection`** calls `GET /api/v0/application`
 *    (`src/slskd/Core/API/Controllers/ApplicationController.cs::State`,
 *    `[Authorize(Policy = AuthPolicy.Any)]`) — the same lightweight authenticated-GET
 *    pattern `qbittorrent.ts` uses (`GET /api/v2/app/version`) and `prowlarr.ts` uses
 *    (`GET /api/v1/system/status`).
 *
 * Two things this file could **not** verify against source and had to assume, flagged here
 * rather than silently relied on:
 *  - JSON property casing. ASP.NET Core's `AddControllers()` applies camelCase property
 *    naming by default, and nothing in `Program.cs` overrides `PropertyNamingPolicy` — only
 *    `Converters` are appended — so this file assumes camelCase (`searchText`, `username`,
 *    `bytesTransferred`, ...) rather than the C# PascalCase the source shows. This is the
 *    framework default, not confirmed against a captured real response.
 *  - `Transfer.AverageSpeed`'s unit. Named and used (`RemainingTime = BytesRemaining /
 *    AverageSpeed` in `Transfer.cs`) consistently with bytes/second, which is what this
 *    file assumes for `DownloadStatus.downloadRateBytes` — never independently confirmed
 *    against a doc string.
 */

import { z } from 'zod';
import { ProviderError } from '../types.js';
import type {
  AddDownloadOptions,
  DownloadState,
  DownloadStatus,
  MusicCandidate,
  MusicProviderFactory,
  MusicRequestProvider,
  MusicSearchQuery,
  ProviderFactoryDeps,
} from '../types.js';

const PROVIDER_ID = 'slskd';
const DEFAULT_RESPONSE_LIMIT = 50;
const MAX_RESPONSE_LIMIT = 200;

/** How often this client polls `GET /searches/{id}` while a search is in flight. slskd's
 * own side of that call is a cheap in-memory lookup (see `Search.cs`), so a tight interval
 * only costs this process a few extra round trips, in exchange for returning as soon as the
 * search genuinely can. */
const SEARCH_POLL_INTERVAL_MS = 400;
/** Sent as the search's own `searchTimeout` (seconds since the last response — see
 * `SearchRequest.cs`'s doc comment). */
const SEARCH_TIMEOUT_SECONDS = 12;
/** Hard ceiling on top of `SEARCH_TIMEOUT_SECONDS`, independent of slskd's own timeout —
 * guards against a search that never reaches `Completed` at all (a wedged connection, a
 * slskd bug), which without this would hang the caller forever. */
const SEARCH_POLL_CEILING_MS = (SEARCH_TIMEOUT_SECONDS + 5) * 1000;

// ---------------------------------------------------------------------------
// Wire shapes — parsed at the boundary so a slskd version drift becomes a typed
// `bad_response`, not `undefined` deep inside this file.
// ---------------------------------------------------------------------------

const startSearchResponseSchema = z.object({ id: z.string().min(1) });

const searchStatusSchema = z.object({
  id: z.string(),
  state: z.string(),
});

const searchFileSchema = z.object({
  filename: z.string(),
  size: z.number(),
  bitRate: z.number().nullable().optional(),
  extension: z.string().nullable().optional(),
});

const searchResponseEntrySchema = z.object({
  username: z.string().min(1),
  queueLength: z.number().optional().default(0),
  uploadSpeed: z.number().optional().default(0),
  hasFreeUploadSlot: z.boolean().optional().default(false),
  files: z.array(searchFileSchema).optional().default([]),
});

const searchResponsesSchema = z.array(searchResponseEntrySchema);

const transferSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  size: z.number(),
  state: z.string(),
  bytesTransferred: z.number().optional().default(0),
  averageSpeed: z.number().optional().default(0),
  exception: z.string().nullable().optional(),
});

const enqueueBatchResponseSchema = z.object({
  batch: z
    .object({ transfers: z.array(transferSchema).nullable().optional().default([]) })
    .nullable()
    .optional(),
  failures: z
    .array(z.object({ filename: z.string().optional(), message: z.string().optional() }))
    .optional()
    .default([]),
});

/** The handle this provider hands back from `add()` and expects back from `status()`/
 * `remove()`. Packs both pieces `GET/DELETE /transfers/downloads/{username}/{id}` needs —
 * neither is derivable from the other, and `DownloadClientProvider`-shaped callers only
 * carry a single opaque string. */
interface SlskdHandle {
  username: string;
  id: string;
}

/** What a `MusicCandidate.guid` decodes to for this provider — the three fields slskd's own
 * enqueue call needs (`username`, `filename`, `size`) and nothing else carries. */
interface SlskdCandidateHandle {
  username: string;
  filename: string;
  size: number;
}

function requireConfig(config: ProviderFactoryDeps['config']): { baseUrl: string; apiKey: string } {
  const baseUrl = config.baseUrl?.trim();
  const apiKey = config.secret?.trim();
  if (!baseUrl || !apiKey) {
    throw new ProviderError(
      'unauthorized',
      PROVIDER_ID,
      'slskd is not configured: a base URL and an API key are both required.',
    );
  }
  return { baseUrl, apiKey };
}

function clampLimit(limit: number | undefined): number {
  const requested = limit ?? DEFAULT_RESPONSE_LIMIT;
  return Math.min(MAX_RESPONSE_LIMIT, Math.max(1, Math.trunc(requested)));
}

/** Base filename without its directory — Soulseek filenames arrive as a full remote path
 * (commonly Windows-style, `\`-separated), never just a leaf name. */
function baseName(path: string): string {
  const normalised = path.replaceAll('\\', '/');
  const segments = normalised.split('/').filter((s) => s.length > 0);
  return segments.at(-1) ?? path;
}

/** Strips a recognised audio extension from a display title, so "Song Title.flac" reads as
 * "Song Title". Total: an unrecognised or absent extension is left as-is. */
function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function extensionOf(filename: string, reported: string | null | undefined): string | null {
  const fromReport = reported?.replace(/^\./, '').toLowerCase().trim();
  if (fromReport) return fromReport;
  const base = baseName(filename);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : null;
}

/**
 * Best-effort artist/album guess from a Soulseek path's directory structure. Shared
 * libraries are conventionally laid out `.../Artist/Album/NN - Title.ext`, but nothing
 * enforces that — this is a heuristic over an unstructured filesystem path, not a fact
 * slskd reports, and degrades to `{ artist: null, album: null }` whenever the path is too
 * shallow to guess from. Never verified against a real slskd share; flagged in this wave's
 * report as unverified rather than presented as settled.
 */
function guessArtistAlbum(path: string): { artist: string | null; album: string | null } {
  const normalised = path.replaceAll('\\', '/');
  const segments = normalised.split('/').filter((s) => s.length > 0);
  // Drop the filename itself; what's left, if anything, is directory structure.
  const dirs = segments.slice(0, -1);
  if (dirs.length === 0) return { artist: null, album: null };
  const album = dirs.at(-1) ?? null;
  const artist = dirs.length >= 2 ? (dirs.at(-2) ?? null) : null;
  return { artist, album };
}

/**
 * `AddDownloadOptions.savePath` is documented (`types.ts`) as an absolute path in the
 * download client's own filesystem namespace — what `getBookSavePath` feeds qBittorrent's
 * `savepath` verbatim. slskd's `destination` is a different, stricter thing:
 * `EnqueueDownloadBatchOptions.Destination`
 * (`src/slskd/Transfers/API/DTO/EnqueueDownloadBatchRequest.cs`) is decorated
 * `[RelativePath(OperatingSystem.All)]` and `[NonTraversingPath]`, and its own doc comment
 * says "relative to the configured download directory" — an absolute path or a `..`
 * segment fails slskd's own model validation with a 400. Rather than let that surface as an
 * opaque `rejected` HTTP error, `add()` below checks locally first and names the real
 * constraint, since this is exactly the "reports success, nothing lands" failure class
 * `docs/HANDOVER.md`'s save-path section is written to prevent — a caller reusing the
 * pattern of a book save path (an absolute path) here would otherwise fail confusingly.
 */
function isRelativeSavePath(path: string): boolean {
  if (path.startsWith('/') || path.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(path)) return false;
  if (path.split(/[\\/]/).includes('..')) return false;
  return true;
}

function encodeCandidateHandle(handle: SlskdCandidateHandle): string {
  return JSON.stringify(handle);
}

function decodeCandidateHandle(guid: string): SlskdCandidateHandle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(guid);
  } catch {
    throw new ProviderError(
      'rejected',
      PROVIDER_ID,
      'This release did not come from slskd — its handle is not decodable.',
    );
  }
  const result = z
    .object({ username: z.string().min(1), filename: z.string().min(1), size: z.number() })
    .safeParse(parsed);
  if (!result.success) {
    throw new ProviderError(
      'rejected',
      PROVIDER_ID,
      'This release did not come from slskd — its handle is missing required fields.',
    );
  }
  return result.data;
}

function encodeHandle(handle: SlskdHandle): string {
  return JSON.stringify(handle);
}

function decodeHandle(handle: string): SlskdHandle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(handle);
  } catch {
    throw new ProviderError('rejected', PROVIDER_ID, 'Not a slskd download handle.');
  }
  const result = z.object({ username: z.string().min(1), id: z.string().min(1) }).safeParse(parsed);
  if (!result.success) {
    throw new ProviderError('rejected', PROVIDER_ID, 'Not a slskd download handle.');
  }
  return result.data;
}

/** `TransferStateCategories.Queued`/`.InProgress` flag-name membership, checked by
 * substring since a combined state serialises as a comma-joined flag-name list. */
function hasFlag(state: string, flag: string): boolean {
  return state.split(',').some((part) => part.trim() === flag);
}

const FAILURE_FLAGS = ['Cancelled', 'TimedOut', 'Errored', 'Rejected', 'Aborted'];

function mapTransferState(
  state: string,
  exception: string | null | undefined,
): {
  state: DownloadState;
  errorMessage: string | null;
} {
  const isCompleted = hasFlag(state, 'Completed');
  if (isCompleted) {
    if (hasFlag(state, 'Succeeded')) return { state: 'completed', errorMessage: null };
    const failureFlag = FAILURE_FLAGS.find((flag) => hasFlag(state, flag));
    if (failureFlag) {
      return {
        state: 'error',
        errorMessage: exception ?? `slskd reported transfer state "${state}"`,
      };
    }
    // `Completed` with neither `Succeeded` nor a recognised failure flag is the "in case of
    // malfunction" fallback `TransferStateCategories.cs` itself calls out — pessimistic on
    // purpose, matching `qbittorrent.ts`'s identical stance on an unrecognised terminal
    // state: silently mapping it to success would hide a real failure from the user.
    return {
      state: 'error',
      errorMessage: `slskd reported an unrecognised terminal state "${state}"`,
    };
  }
  if (hasFlag(state, 'Queued') || hasFlag(state, 'Requested')) {
    return { state: 'queued', errorMessage: null };
  }
  if (hasFlag(state, 'Initializing') || hasFlag(state, 'InProgress')) {
    return { state: 'downloading', errorMessage: null };
  }
  // Unrecognised and not yet completed — pessimistic default, same reasoning as above.
  return {
    state: 'error',
    errorMessage: `slskd reported an unrecognised transfer state "${state}"`,
  };
}

export const createSlskdProvider: MusicProviderFactory = ({
  config,
  fetch: fetchFn,
}: ProviderFactoryDeps): MusicRequestProvider => {
  async function call(
    path: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const { baseUrl, apiKey } = requireConfig(config);
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    let response: Response;
    try {
      response = await fetchFn(url, {
        ...init,
        signal,
        headers: { ...init.headers, 'X-API-Key': apiKey },
      });
    } catch (cause) {
      // Never let a transport failure's message repeat the target URL (it may embed the
      // configured host) — see the credential/URL leak sweep this wave adds a route test
      // for. slskd's own base URL is not a secret the way an API key is, but keeping the
      // upstream host out of every error message this pipeline can surface is the safer
      // default regardless.
      throw new ProviderError('unreachable', PROVIDER_ID, 'Could not reach slskd.', { cause });
    }
    if (response.status === 401 || response.status === 403) {
      throw new ProviderError('unauthorized', PROVIDER_ID, 'slskd rejected the API key.');
    }
    return response;
  }

  // `S extends z.ZodTypeAny` + `z.infer<S>` (rather than a bare `z.ZodType<T>` generic) is
  // deliberate: matching against the multi-parameter `ZodType<Output, Def, Input>` let TS
  // infer `T` from the *input* side for any schema built with `.optional().default(...)`,
  // which silently widened fields this function's callers can rely on being always-present
  // back to optional at the type level, despite `safeParse` always filling the default in.
  async function callJson<S extends z.ZodTypeAny>(
    path: string,
    init: RequestInit,
    schema: S,
    signal: AbortSignal | undefined,
    context: string,
  ): Promise<z.infer<S>> {
    const response = await call(path, init, signal);
    if (response.status === 404) {
      throw new ProviderError('not_found', PROVIDER_ID, `slskd: ${context} not found.`);
    }
    if (!response.ok) {
      throw new ProviderError(
        'rejected',
        PROVIDER_ID,
        `slskd: ${context} failed with HTTP ${response.status}.`,
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new ProviderError(
        'bad_response',
        PROVIDER_ID,
        `slskd: ${context} was not valid JSON.`,
        {
          cause,
        },
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ProviderError(
        'bad_response',
        PROVIDER_ID,
        `slskd: ${context} did not match the expected shape: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  /**
   * Known gap, left as-is deliberately rather than fixed under this wave: hitting
   * `SEARCH_POLL_CEILING_MS` and hitting a genuinely empty search are indistinguishable to
   * the caller — both return normally, and `search()` below reads back whatever `responses`
   * exist at that point (`[]` for either case). `requestService.ts`'s `grab()` goes out of
   * its way to avoid exactly this confusion for books ("Reporting a broken Prowlarr as
   * 'nothing found' sends the user hunting for a book that is there"), by carrying indexer
   * errors on `SearchOutcome`. `MusicSearchOutcome` has the same `errors` channel, but a
   * ceiling timeout is not a `ProviderError` (slskd itself answered every poll normally —
   * it just never finished), so nothing here currently reports into it. Worth a warning-
   * severity entry on `MusicSearchOutcome` if this proves to matter in practice; not added
   * speculatively.
   */
  async function pollUntilComplete(
    searchId: string,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const deadline = Date.now() + SEARCH_POLL_CEILING_MS;
    for (;;) {
      const status = await callJson(
        `/api/v0/searches/${encodeURIComponent(searchId)}`,
        { method: 'GET' },
        searchStatusSchema,
        signal,
        'search status',
      );
      if (hasFlag(status.state, 'Completed')) return;
      if (Date.now() >= deadline) {
        // Not an error: slskd may still be waiting on slow peers. Returning here lets the
        // caller read back whatever responses have arrived so far, rather than losing a
        // slow-but-productive search to an impatient timeout.
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, SEARCH_POLL_INTERVAL_MS));
    }
  }

  return {
    id: PROVIDER_ID,
    displayName: 'slskd',

    async search(query: MusicSearchQuery, signal?: AbortSignal): Promise<MusicCandidate[]> {
      const limit = clampLimit(query.limit);
      const started = await callJson(
        '/api/v0/searches',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchText: query.term,
            responseLimit: limit,
            searchTimeout: SEARCH_TIMEOUT_SECONDS,
          }),
        },
        startSearchResponseSchema,
        signal,
        'starting a search',
      );

      await pollUntilComplete(started.id, signal);

      const responses = await callJson(
        `/api/v0/searches/${encodeURIComponent(started.id)}/responses`,
        { method: 'GET' },
        searchResponsesSchema,
        signal,
        'search responses',
      );

      const candidates: Array<{ candidate: MusicCandidate; rank: [boolean, number, number] }> = [];
      for (const entry of responses) {
        for (const file of entry.files) {
          const { artist, album } = guessArtistAlbum(file.filename);
          candidates.push({
            candidate: {
              guid: encodeCandidateHandle({
                username: entry.username,
                filename: file.filename,
                size: file.size,
              }),
              providerId: PROVIDER_ID,
              sourceName: entry.username,
              title: stripExtension(baseName(file.filename)),
              artist,
              album,
              sizeBytes: Number.isFinite(file.size) && file.size > 0 ? file.size : null,
              bitrateKbps: file.bitRate ?? null,
              format: extensionOf(file.filename, file.extension),
            },
            // Prefer peers with a free upload slot, then a shorter remote queue, then a
            // faster reported upload speed — the closest available proxy for "likely to
            // actually finish soon" now that there is no seeder count to rank on.
            rank: [!entry.hasFreeUploadSlot, entry.queueLength, -entry.uploadSpeed],
          });
        }
      }

      candidates.sort((a, b) => {
        if (a.rank[0] !== b.rank[0]) return a.rank[0] ? 1 : -1;
        if (a.rank[1] !== b.rank[1]) return a.rank[1] - b.rank[1];
        return a.rank[2] - b.rank[2];
      });

      return candidates.slice(0, limit).map((c) => c.candidate);
    },

    async add(
      candidate: MusicCandidate,
      options: AddDownloadOptions,
      signal?: AbortSignal,
    ): Promise<string> {
      const decoded = decodeCandidateHandle(candidate.guid);
      const body: Record<string, unknown> = {
        username: decoded.username,
        files: [{ filename: decoded.filename, size: decoded.size }],
      };
      if (options.savePath !== null) {
        if (!isRelativeSavePath(options.savePath)) {
          throw new ProviderError(
            'rejected',
            PROVIDER_ID,
            'slskd only accepts a download destination relative to its own configured ' +
              'download directory — no absolute path and no ".." segment. Check the music ' +
              'save-path setting.',
          );
        }
        body.options = { destination: options.savePath };
      }

      const parsed = await callJson(
        '/api/v0/transfers/downloads/batches',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        enqueueBatchResponseSchema,
        signal,
        'enqueueing a download',
      );

      const transfer = parsed.batch?.transfers?.[0];
      if (!transfer) {
        const reason = parsed.failures[0]?.message;
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          reason
            ? `slskd declined to enqueue "${candidate.title}": ${reason}`
            : `slskd declined to enqueue "${candidate.title}".`,
        );
      }

      return encodeHandle({ username: transfer.username, id: transfer.id });
    },

    async status(handleStr: string, signal?: AbortSignal): Promise<DownloadStatus> {
      const { username, id } = decodeHandle(handleStr);
      const response = await call(
        `/api/v0/transfers/downloads/${encodeURIComponent(username)}/${encodeURIComponent(id)}`,
        { method: 'GET' },
        signal,
      );

      if (response.status === 404) {
        return {
          clientId: PROVIDER_ID,
          handle: handleStr,
          state: 'missing',
          progress: 0,
          contentPath: null,
          downloadRateBytes: 0,
          etaSeconds: null,
          errorMessage: null,
        };
      }
      if (!response.ok) {
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          `slskd: transfer status failed with HTTP ${response.status}.`,
        );
      }

      let json: unknown;
      try {
        json = await response.json();
      } catch (cause) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          'slskd: transfer status was not valid JSON.',
          {
            cause,
          },
        );
      }
      const parsed = transferSchema.safeParse(json);
      if (!parsed.success) {
        throw new ProviderError(
          'bad_response',
          PROVIDER_ID,
          `slskd: transfer status did not match the expected shape: ${parsed.error.message}`,
        );
      }

      const { state, errorMessage } = mapTransferState(parsed.data.state, parsed.data.exception);
      const bytesRemaining = Math.max(0, parsed.data.size - parsed.data.bytesTransferred);
      const etaSeconds =
        parsed.data.averageSpeed > 0 ? Math.round(bytesRemaining / parsed.data.averageSpeed) : null;

      return {
        clientId: PROVIDER_ID,
        handle: handleStr,
        state,
        progress:
          parsed.data.size > 0
            ? Math.min(1, Math.max(0, parsed.data.bytesTransferred / parsed.data.size))
            : 0,
        // slskd's `Transfer` never reports a resolved local path — only `options.destination`
        // (relative, write-only, supplied by the caller) exists on the wire; there is
        // nothing here to read a content path back from.
        contentPath: null,
        downloadRateBytes: Math.max(0, parsed.data.averageSpeed),
        etaSeconds,
        errorMessage,
      };
    },

    async remove(handleStr: string, deleteData: boolean, signal?: AbortSignal): Promise<void> {
      // `deleteData` only ever untracks the transfer in slskd (the `remove` query param) —
      // see this file's header comment: `TransfersController.cs` has no endpoint that
      // deletes a downloaded file from disk. This is the closest available mapping, not a
      // literal one.
      const { username, id } = decodeHandle(handleStr);
      const params = new URLSearchParams({ remove: String(deleteData) });
      const response = await call(
        `/api/v0/transfers/downloads/${encodeURIComponent(username)}/${encodeURIComponent(id)}?${params.toString()}`,
        { method: 'DELETE' },
        signal,
      );
      // Already gone is the state `remove` is trying to reach anyway — same convention as
      // `qbittorrent.ts`'s `remove`.
      if (response.status === 404) return;
      if (!response.ok) {
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          `slskd: removing the transfer failed with HTTP ${response.status}.`,
        );
      }
    },

    async testConnection(signal?: AbortSignal): Promise<void> {
      const response = await call('/api/v0/application', { method: 'GET' }, signal);
      if (!response.ok) {
        throw new ProviderError(
          'rejected',
          PROVIDER_ID,
          `slskd: testConnection failed with HTTP ${response.status}.`,
        );
      }
    },
  };
};

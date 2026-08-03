/**
 * The contract between the request pipeline and the things that plug into it.
 *
 * Two provider shapes, deliberately kept narrow: an **indexer** turns a search term into
 * candidate releases, and a **download client** turns a chosen release into bytes on disk.
 * Everything else — approval, ordering, retry, the Audiobookshelf rescan — is the request
 * service's job, so adding "another indexer" stays one file rather than a refactor.
 *
 * Providers take an injected `fetch` (house rule: no network in unit tests) and are
 * constructed from a `ResolvedProviderConfig` read out of the database, never from
 * environment variables — the user configures these in the app, not in a compose file.
 */

import type { FetchLike } from '@auralis/abs-client';

/** Why a provider call failed, in the vocabulary the routes map to HTTP status codes. */
export type ProviderErrorKind =
  /** Credentials missing, wrong, or expired. */
  | 'unauthorized'
  /** DNS, connection refused, TLS, timeout — we never reached it. */
  | 'unreachable'
  /** We reached it and it answered with something we could not parse. */
  | 'bad_response'
  /** It answered, and the answer was "no such thing". */
  | 'not_found'
  /** It answered, understood us, and declined. */
  | 'rejected';

/**
 * The single error type providers throw. Callers switch on `kind` rather than sniffing
 * messages, so a wording change upstream can never silently reroute error handling.
 */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly providerId: string;

  constructor(
    kind: ProviderErrorKind,
    providerId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProviderError';
    this.kind = kind;
    this.providerId = providerId;
  }
}

/**
 * One candidate download, normalised across indexers.
 *
 * Fields an indexer does not report are `null` or `0` rather than absent, so ranking code
 * never has to distinguish "zero seeders" from "did not say" with an `undefined` check —
 * where that distinction matters, the field is nullable and says so.
 */
export interface Release {
  /** Unique within one search response, and the handle used to grab it. */
  guid: string;
  /** Which indexer produced this — `IndexerProvider.id`. */
  indexerId: string;
  /** The indexer's own name for the source (e.g. `AudioBook Bay`), for display. */
  sourceName: string;
  title: string;
  /** Size in bytes. `null` when the indexer does not report one. */
  sizeBytes: number | null;
  seeders: number;
  leechers: number;
  /** Epoch milliseconds. `null` when the indexer does not report one. */
  publishedAt: number | null;
  /** A `.torrent` URL. `null` when only a magnet is on offer. */
  downloadUrl: string | null;
  /** A `magnet:` URI. `null` when only a `.torrent` URL is on offer. */
  magnetUri: string | null;
  /** Category labels exactly as the indexer reports them. */
  categories: string[];
  /** Best-effort audio format hint parsed from the title (`m4b`, `mp3`, `flac`). */
  format: string | null;
}

export interface IndexerSearchQuery {
  /** The free-text term. Never empty — callers trim and reject blanks first. */
  term: string;
  /** Narrows the search when the caller knows it. */
  author?: string;
  /** Upper bound on results. Providers may return fewer; never more. */
  limit?: number;
}

/**
 * A source of candidate releases.
 *
 * `search` **degrades rather than throws for an empty result** — no matches is `[]`, not a
 * `not_found` error. It throws `ProviderError` only when the provider itself is broken or
 * unreachable, because those two cases mean very different things to the user.
 */
export interface IndexerProvider {
  readonly id: string;
  readonly displayName: string;
  search(query: IndexerSearchQuery, signal?: AbortSignal): Promise<Release[]>;
  /** Credential/liveness check for the settings screen. Resolves on success, throws otherwise. */
  testConnection(signal?: AbortSignal): Promise<void>;
}

export type DownloadState =
  | 'queued'
  | 'downloading'
  | 'seeding'
  | 'completed'
  | 'paused'
  | 'error'
  /** The client has never heard of this handle — removed behind our back, or wiped. */
  | 'missing';

export interface DownloadStatus {
  /** Which client this came from — `DownloadClientProvider.id`. */
  clientId: string;
  /** The client's own handle for the download (the info hash, for both torrent clients). */
  handle: string;
  state: DownloadState;
  /** Fraction complete, clamped to 0..1. */
  progress: number;
  /**
   * Where the finished content sits **as the download client sees it**. The BFF may see a
   * different path for the same bytes — the two run in different containers — so this is
   * reported, never assumed to be openable here.
   */
  contentPath: string | null;
  /** Current rate in bytes/second; `0` when idle. */
  downloadRateBytes: number;
  /** Seconds remaining. `null` when unknown or effectively infinite. */
  etaSeconds: number | null;
  /** Set only when `state === 'error'`. */
  errorMessage: string | null;
}

export interface AddDownloadOptions {
  /**
   * Where the client should save it, in the client's own filesystem namespace. `null`
   * leaves the client's default alone — which is the right default, because the path
   * Audiobookshelf watches is a deployment fact this code cannot discover.
   */
  savePath: string | null;
  /** Client-side label/category, so a human can tell Auralis' downloads apart. */
  category: string | null;
}

/**
 * Somewhere to send a chosen release.
 *
 * `add` returns the client's handle, which the request row stores; every later call is
 * keyed by that handle. Implementations must return the **info hash lowercased** so a
 * handle is comparable across a client restart.
 */
export interface DownloadClientProvider {
  readonly id: string;
  readonly displayName: string;
  add(release: Release, options: AddDownloadOptions, signal?: AbortSignal): Promise<string>;
  /** Never throws `not_found` for an unknown handle — reports `state: 'missing'` instead. */
  status(handle: string, signal?: AbortSignal): Promise<DownloadStatus>;
  remove(handle: string, deleteData: boolean, signal?: AbortSignal): Promise<void>;
  testConnection(signal?: AbortSignal): Promise<void>;
}

/** A provider's stored configuration, with its secret already decrypted. */
export interface ResolvedProviderConfig {
  id: string;
  kind: ProviderKind;
  enabled: boolean;
  /** Absent for providers that talk to a fixed public site (the AudiobookBay scraper). */
  baseUrl: string | null;
  /** Non-secret provider options, parsed from the stored JSON. */
  options: Record<string, unknown>;
  /** The decrypted secret (API key, password). `null` when the provider needs none. */
  secret: string | null;
}

export type ProviderKind = 'indexer' | 'download';

export interface ProviderFactoryDeps {
  config: ResolvedProviderConfig;
  fetch: FetchLike;
}

export type IndexerFactory = (deps: ProviderFactoryDeps) => IndexerProvider;
export type DownloadClientFactory = (deps: ProviderFactoryDeps) => DownloadClientProvider;

/** Static description of a provider, for the settings screen's "what can I add" list. */
export interface ProviderDescriptor {
  id: string;
  displayName: string;
  kind: ProviderKind;
  /** Whether the provider needs a `baseUrl` — false for the fixed-site scraper. */
  requiresBaseUrl: boolean;
  /** Whether the provider needs a secret — false for anonymous sources. */
  requiresSecret: boolean;
  /** One line explaining the trade-off, shown under the name in settings. */
  summary: string;
}

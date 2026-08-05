/**
 * The only caller of `RequestService.pollDownloads` / `MusicRequestService.pollDownloads`
 * in production. Both services carry a fully-tested `pollDownloads` (see
 * `requestService.ts`/`musicRequestService.ts`), but nothing invoked it outside of tests —
 * a request that reached `downloading` sat there forever regardless of what actually
 * happened to the download. This module gives them a caller: a `setInterval` loop that
 * runs for the lifetime of the server process, wired up in `app.ts`.
 *
 * This file does not change `pollDownloads` or `requestStatus.ts`'s transition table — it
 * only decides *when* the existing, tested logic runs.
 */

export interface DownloadPollerDeps {
  requests: { pollDownloads(): Promise<void> };
  musicRequests: { pollDownloads(): Promise<void> };
  /** How often to poll, in milliseconds. See `app.ts` for the production default and the
   * env var that overrides it. */
  intervalMs: number;
  /** Optional structured logger; default is a no-op — mirrors `requestService.ts`'s own
   * `logger?` pattern. Never receives anything beyond the caught error itself, so
   * whatever redaction a real logger applies to `err` is the only redaction this needs. */
  logger?: { error(o: unknown, m?: string): void };
}

export interface DownloadPoller {
  /** Idempotent — calling it again while already running is a no-op, not a second timer. */
  start(): void;
  /** Idempotent — calling it again (or before `start()`) is a no-op, never throws. */
  stop(): void;
}

const NOOP_LOGGER: NonNullable<DownloadPollerDeps['logger']> = { error() {} };

/**
 * Runs both `pollDownloads` methods on a fixed interval.
 *
 * Design choices, each load-bearing for a background job that outlives a single request:
 *
 * - **Reentrancy guard**: a tick that is still running when the next interval fires is
 *   skipped rather than stacked. Both `pollDownloads` implementations already query for
 *   `status = 'downloading'` at the start of their own call, so a skipped tick loses
 *   nothing but a little freshness — it is not a missed event.
 * - **Book and music are polled independently within one tick.** Each is wrapped in its
 *   own try/catch so a failure in one (an upstream down, a provider unconfigured) cannot
 *   prevent the other from running in the same tick, and cannot stop the *next* tick
 *   either — the whole point of a poller is that a bad tick is just one bad tick.
 * - **Nothing to do is cheap by construction**: with no request in `downloading`, both
 *   `pollDownloads` calls resolve immediately after one no-op DB query each (see their own
 *   file comments) — this module adds no additional "is there anything to do" check on
 *   top of that, since duplicating it here would be one more place for the two checks to
 *   drift apart.
 */
export function createDownloadPoller(deps: DownloadPollerDeps): DownloadPoller {
  const logger = deps.logger ?? NOOP_LOGGER;
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  async function pollOneKind(kind: 'book' | 'music', poll: () => Promise<void>): Promise<void> {
    try {
      await poll();
    } catch (err) {
      // A poller that dies on its first surprise is worse than no poller — the UI would
      // keep showing "downloading" as though something were still watching it. Log and
      // let the next tick try again.
      logger.error({ err, kind }, 'downloadPoller: tick failed');
    }
  }

  async function tick(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      await pollOneKind('book', () => deps.requests.pollDownloads());
      await pollOneKind('music', () => deps.musicRequests.pollDownloads());
    } finally {
      ticking = false;
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => void tick(), deps.intervalMs);
    },
    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

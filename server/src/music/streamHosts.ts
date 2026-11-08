/**
 * Where a stream's host is looked up. Checked live on the server (8 Nov 2026): the first lookup of a
 * stream host, through the container's DNS and the household's resolvers behind it, took about 2 s
 * for nearly every tap, while the rest of the tap took about 0.5 s. A lost answer waits for the
 * system resolver's resend, about 2 s; IPv4 alone, resent after 250 ms, waited at most about 1 s.
 *
 * So a host is looked up once, its answer held and refreshed behind the stream once it is a minute
 * old, and `warm` asks as soon as a song resolves, before its first fetch. The addresses held are
 * still checked as public by the fetch, each time.
 */
import { promises as dns } from 'node:dns';
import type { StreamUrl } from './schemas.js';

/** How old a held answer may be before a refresh is asked behind it. */
const REFRESH_AFTER_MS = 60_000;
/** How long a held answer is used at all; a stream's address lasts about 6 hours. */
const KEEP_MS = 6 * 60 * 60_000;
/** More hosts than this, and the oldest go. A region serves from a few dozen. */
const MOST_HOSTS = 512;

export type HostLookup = (host: string) => Promise<string[]>;

export interface StreamHostsOptions {
  lookup: HostLookup;
  now: () => number;
  refreshAfterMs?: number;
  keepMs?: number;
}

export class StreamHosts {
  private readonly held = new Map<string, { addresses: string[]; at: number }>();
  private readonly asking = new Map<string, Promise<string[]>>();

  constructor(private readonly opts: StreamHostsOptions) {}

  /** A host's addresses: held ones at once, or one lookup shared by everyone asking. */
  lookup(host: string): Promise<string[]> {
    const kept = this.held.get(host);
    const age = kept === undefined ? Infinity : this.opts.now() - kept.at;
    if (kept === undefined || age > (this.opts.keepMs ?? KEEP_MS)) return this.ask(host);
    if (age > (this.opts.refreshAfterMs ?? REFRESH_AFTER_MS)) this.ask(host).catch(() => undefined);
    return Promise.resolve(kept.addresses);
  }

  /** Looks up a stream URL's host ahead of its first fetch, unless held; never throws. */
  warm(url: StreamUrl): void {
    let host: string;
    try {
      host = new URL(url.reveal()).hostname;
    } catch {
      return;
    }
    if (this.held.has(host)) return;
    this.ask(host).catch(() => undefined);
  }

  private ask(host: string): Promise<string[]> {
    const running = this.asking.get(host);
    if (running !== undefined) return running;
    const asked = this.opts
      .lookup(host)
      .then((addresses) => {
        if (this.held.size >= MOST_HOSTS) this.held.delete(this.held.keys().next().value ?? '');
        this.held.delete(host);
        this.held.set(host, { addresses, at: this.opts.now() });
        return addresses;
      })
      .finally(() => this.asking.delete(host));
    this.asking.set(host, asked);
    return asked;
  }
}

export interface QuickLookupOptions {
  resolve4: (host: string) => Promise<string[]>;
  lookupAll: HostLookup;
}

/** IPv4 addresses, asked again after 250 ms when no answer comes; else the system's lookup. */
export function quickLookup(options?: QuickLookupOptions): HostLookup {
  const resolver = new dns.Resolver({ timeout: 250, tries: 4 });
  const { resolve4, lookupAll } = options ?? {
    resolve4: (host: string) => resolver.resolve4(host),
    lookupAll: async (host: string) =>
      (await dns.lookup(host, { all: true })).map(({ address }) => address),
  };
  return async (host) => {
    const v4 = await resolve4(host).catch(() => []);
    return v4.length > 0 ? v4 : lookupAll(host);
  };
}

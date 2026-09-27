/**
 * Which socket addresses may speak for a client through `X-Forwarded-*`. IPs and CIDRs go
 * through Fastify's own matcher; a hostname (a container name, say) is resolved at boot and again
 * once a minute, so the trust follows the proxy to a new address and drops the old one.
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import proxyAddr from '@fastify/proxy-addr';

export type Lookup = (hostname: string) => Promise<string[]>;

const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const HOSTNAME =
  /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const REFRESH_MS = 60_000;

function isAddressEntry(entry: string): boolean {
  if (KEYWORDS.has(entry) || isIP(entry) !== 0) return true;
  const [ip, bits, ...rest] = entry.split('/');
  if (rest.length > 0 || ip === undefined || bits === undefined || !/^\d{1,3}$/.test(bits)) {
    return false;
  }
  const family = isIP(ip);
  return family !== 0 && Number(bits) <= (family === 4 ? 32 : 128);
}

/** An IP, a CIDR, one of proxy-addr's keywords, or a hostname. */
export function isProxyEntry(entry: string): boolean {
  return isAddressEntry(entry) || HOSTNAME.test(entry);
}

const defaultLookup: Lookup = async (hostname) =>
  (await dnsLookup(hostname, { all: true })).map((a) => a.address);

export interface ProxyTrust {
  /** Fastify's `trustProxy` function. */
  trust: (address: string, hop: number) => boolean;
  /** Resolves the hostnames again. A failed lookup keeps that name's last addresses. */
  refresh: () => Promise<void>;
  /** Refreshes when the last resolution is a minute old; call it before a request is read. */
  refreshIfStale: () => Promise<void>;
}

export function createProxyTrust(
  entries: readonly string[],
  options: { lookup?: Lookup; now?: () => number } = {},
): ProxyTrust {
  const lookup = options.lookup ?? defaultLookup;
  const now = options.now ?? Date.now;
  const fixed = entries.filter(isAddressEntry);
  const hostnames = entries.filter((entry) => !isAddressEntry(entry));
  const resolved = new Map<string, string[]>();
  let matcher: (address: string, hop: number) => boolean = () => false;
  let resolvedAt = Number.NEGATIVE_INFINITY;
  let inFlight: Promise<void> | undefined;

  function compile(): void {
    const all = [...fixed, ...[...resolved.values()].flat()];
    matcher = all.length === 0 ? () => false : proxyAddr.compile(all);
  }
  compile();

  async function resolveAll(): Promise<void> {
    await Promise.all(
      hostnames.map(async (hostname) => {
        try {
          resolved.set(hostname, await lookup(hostname));
        } catch {
          // The proxy may be restarting; keep believing its last known address until it answers.
        }
      }),
    );
    resolvedAt = now();
    compile();
  }

  const refresh = (): Promise<void> => {
    inFlight ??= resolveAll().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  return {
    trust: (address, hop) => matcher(address, hop),
    refresh,
    refreshIfStale: () =>
      hostnames.length > 0 && now() - resolvedAt >= REFRESH_MS ? refresh() : Promise.resolve(),
  };
}

/**
 * Which upstream account is this person's. Upstream usernames are display names, so the
 * directory login id is compared with each one folded: NFKD, marks dropped, lower-cased. Exactly
 * one active hit links; none or two leave the service unlinked. The id found is then pinned by the
 * caller, so a later rename never re-matches. A person links to their own account, admin or not;
 * Auralis's own service accounts are never matched, an Audiobookshelf root match stays unlinked,
 * because an admin key cannot mint a key for root, and a disabled match stays unlinked. Only
 * `no_account` lets the caller create an account.
 */

import type { Service } from '../store/upstreamLinks.js';

export interface UpstreamCandidate {
  id: string;
  username: string;
  /** Audiobookshelf's root account, for which the provisioning key cannot mint. */
  root?: boolean;
  /** Switched off upstream: never linked, and it still stops an account being created. */
  disabled?: boolean;
}

/** Auralis's own accounts upstream, folded: the recording user, and ABS's provisioning user. */
export const SERVICE_ACCOUNTS: Readonly<Record<Service, readonly string[]>> = {
  abs: ['auralis', 'auralis-admin'],
  jellyfin: ['auralis'],
};

export type Pick =
  | { state: 'linked'; id: string }
  | {
      state: 'unlinked';
      detail: 'no_account' | 'ambiguous' | 'upstream_root' | 'service_account' | 'disabled';
    };

export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function pickUpstreamUser(
  service: Service,
  candidates: readonly UpstreamCandidate[],
  loginId: string,
): Pick {
  const want = foldName(loginId);
  if (SERVICE_ACCOUNTS[service].includes(want)) {
    return { state: 'unlinked', detail: 'service_account' };
  }
  const named = candidates.filter((c) => foldName(c.username) === want);
  const hits = named.filter((c) => c.disabled !== true);
  if (hits.length === 0) {
    return { state: 'unlinked', detail: named.length > 0 ? 'disabled' : 'no_account' };
  }
  if (hits.length > 1) return { state: 'unlinked', detail: 'ambiguous' };
  const hit = hits[0] as UpstreamCandidate;
  if (hit.root === true) return { state: 'unlinked', detail: 'upstream_root' };
  return { state: 'linked', id: hit.id };
}

/**
 * Which upstream account is this person's. Upstream usernames are display names, so the
 * directory login id is compared with each one folded: NFKD, marks dropped, lower-cased. Exactly
 * one hit links; none or two leave the service unlinked. The id found is then pinned by the
 * caller, so a later rename never re-matches. An upstream admin or root account is never linked,
 * nor Auralis's own service accounts, so a person's token can never act with more than a member's
 * reach.
 */

export interface UpstreamCandidate {
  id: string;
  username: string;
  /** An admin, root or administrator account upstream: never linked. */
  admin: boolean;
}

/** Auralis's own accounts upstream: the recording user and the ABS provisioning user. */
export const SERVICE_ACCOUNTS: readonly string[] = ['auralis', 'auralis-admin'];

export type Pick =
  { state: 'linked'; id: string } | { state: 'unlinked'; detail: 'no_account' | 'ambiguous' };

export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function pickUpstreamUser(candidates: readonly UpstreamCandidate[], loginId: string): Pick {
  const want = foldName(loginId);
  const hits = candidates.filter(
    (c) =>
      !c.admin && !SERVICE_ACCOUNTS.includes(foldName(c.username)) && foldName(c.username) === want,
  );
  if (hits.length === 0) return { state: 'unlinked', detail: 'no_account' };
  if (hits.length > 1) return { state: 'unlinked', detail: 'ambiguous' };
  return { state: 'linked', id: (hits[0] as UpstreamCandidate).id };
}

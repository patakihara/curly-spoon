/**
 * Which upstream account is this person's. Upstream usernames are display names, so the
 * directory login id is compared with each one folded: NFKD, marks dropped, lower-cased. Exactly
 * one hit links; none or two leave the service unlinked. The id found is then pinned by the
 * caller, so a later rename never re-matches.
 */

export interface UpstreamCandidate {
  id: string;
  username: string;
}

export type Pick =
  { state: 'linked'; id: string } | { state: 'unlinked'; detail: 'no_account' | 'ambiguous' };

export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function pickUpstreamUser(candidates: readonly UpstreamCandidate[], loginId: string): Pick {
  const want = foldName(loginId);
  const hits = candidates.filter((c) => foldName(c.username) === want);
  if (hits.length === 0) return { state: 'unlinked', detail: 'no_account' };
  if (hits.length > 1) return { state: 'unlinked', detail: 'ambiguous' };
  return { state: 'linked', id: (hits[0] as UpstreamCandidate).id };
}

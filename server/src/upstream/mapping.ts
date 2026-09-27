/**
 * Which upstream account is this person's. Upstream usernames are display names, so the
 * directory login id is compared with each one folded: NFKD, marks dropped, lower-cased. Exactly
 * one hit links; none or two leave the service unlinked. The id found is then pinned by the
 * caller, so a later rename never re-matches.
 */

export interface UpstreamCandidate {
  id: string;
  username: string;
  /** Audiobookshelf's `authOpenIDSub`: when present, it must be this person's subject. */
  oidcSub?: string | null;
}

export type Pick =
  | { state: 'linked'; id: string }
  | { state: 'unlinked'; detail: 'no_account' | 'ambiguous' | 'subject_mismatch' };

export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function pickUpstreamUser(
  candidates: readonly UpstreamCandidate[],
  who: { loginId: string; sub?: string },
): Pick {
  const want = foldName(who.loginId);
  const hits = candidates.filter((c) => foldName(c.username) === want);
  if (hits.length === 0) return { state: 'unlinked', detail: 'no_account' };
  if (hits.length > 1) return { state: 'unlinked', detail: 'ambiguous' };
  const [hit] = hits as [UpstreamCandidate];
  if (hit.oidcSub != null && hit.oidcSub !== '' && hit.oidcSub !== who.sub) {
    return { state: 'unlinked', detail: 'subject_mismatch' };
  }
  return { state: 'linked', id: hit.id };
}

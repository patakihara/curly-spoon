/**
 * One place to decide whether a feed item is something the user does not have.
 *
 * Web and Android infer this differently *because their types differ*, not by accident, and the
 * difference is easy to get wrong in a way no type error catches:
 *
 * - Android route-scopes `availability` to its recommended-item model, where kotlinx declares it
 *   required. The field is therefore always present at the point of the check, so Android can and
 *   does read `availability != "owned"`.
 * - Web mirrors its types by hand with no runtime decode, and `availability` is **optional on an
 *   interface shared by every item** — an ordinary Audiobookshelf book carries no `availability`
 *   at all. So on web, absent is the overwhelmingly common case and means "owned", not "unknown".
 *
 * Transliterating Android's `!= "owned"` onto web therefore marks the user's entire library as
 * external: every owned book on Home renders a "not in your library" badge and taps through to the
 * request flow. That regression shipped briefly and was caught by `tablet-breakpoint.spec.ts`
 * asserting that clicking Dune opens `/item/item-dune`.
 *
 * What we actually want is fail-safe against *drift* without breaking the ordinary case:
 * a value that is present but not `'owned'` — a third state added server-side, a misspelling — is
 * treated as external, because rendering an unknown state as an ordinary owned item is what
 * produces a dead-end tap to an id the upstream server has never heard of.
 *
 * Never infer this by parsing the `external:<provider>:<id>` prefix out of the id. Parsing meaning
 * out of an opaque identifier is implicit coupling that breaks silently when the scheme changes.
 */
export function isExternalItem(item: { availability?: string }): boolean {
  return item.availability != null && item.availability !== 'owned';
}

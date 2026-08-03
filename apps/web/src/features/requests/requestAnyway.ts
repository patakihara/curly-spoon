/**
 * Whether `AskForBookPanel` should offer to queue the typed title with no
 * release attached — the client side of `POST /requests`'s `release` being
 * optional, and of `grab` searching again at grab time. Deliberately indifferent
 * to *why* `releaseCount` is zero (nothing matched vs. every indexer errored):
 * a user whose indexer is down is exactly the user who most needs to queue the
 * request anyway rather than being turned away, so both empty cases offer it.
 */
export interface ShouldOfferRequestAnywayInput {
  submittedTerm: string;
  isLoading: boolean;
  releaseCount: number;
}

export function shouldOfferRequestAnyway(input: ShouldOfferRequestAnywayInput): boolean {
  return input.submittedTerm.trim().length > 0 && !input.isLoading && input.releaseCount === 0;
}

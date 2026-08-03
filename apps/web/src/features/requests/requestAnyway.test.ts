/**
 * `AskForBookPanel`'s "Request anyway" affordance — queues the typed title with
 * no release attached (the server searches again at grab time). It must appear
 * only once a search has genuinely come up empty, never before a search runs
 * and never alongside real results, so this is pinned independently of the
 * component.
 */
import { describe, expect, it } from 'vitest';
import { shouldOfferRequestAnyway } from './requestAnyway.js';

describe('shouldOfferRequestAnyway', () => {
  it('is false before any search has been submitted', () => {
    expect(shouldOfferRequestAnyway({ submittedTerm: '', isLoading: false, releaseCount: 0 })).toBe(
      false,
    );
  });

  it('is false while a search is in flight, even with a submitted term', () => {
    expect(
      shouldOfferRequestAnyway({ submittedTerm: 'dune', isLoading: true, releaseCount: 0 }),
    ).toBe(false);
  });

  it('is false once real results came back — never offered alongside results', () => {
    expect(
      shouldOfferRequestAnyway({ submittedTerm: 'dune', isLoading: false, releaseCount: 3 }),
    ).toBe(false);
  });

  it('is true once a submitted search returns zero releases — nothing matched', () => {
    expect(
      shouldOfferRequestAnyway({ submittedTerm: 'dune', isLoading: false, releaseCount: 0 }),
    ).toBe(true);
  });

  it('is true when zero releases came back because every indexer errored — the down-indexer case still needs the queue option', () => {
    expect(
      shouldOfferRequestAnyway({ submittedTerm: 'dune', isLoading: false, releaseCount: 0 }),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { RequestStatus } from '../../api/types.js';
import { REQUEST_STATUS_LABEL } from './statusLabels.js';

/**
 * Every status the server's `RequestStatus` union can carry must render a real label —
 * an omission shows up in the UI as `undefined`, not a compile error, because
 * `Record<RequestStatus, string>` only catches a *missing key* in the map itself. This
 * test pins the same guarantee at runtime, with the statuses spelled out by hand rather
 * than derived from the map: deriving from `Object.keys` would make this test pass
 * trivially no matter what the map contains.
 *
 * The hand-written list could itself drift from `RequestStatus` — go stale by omission
 * the same way the map once did — so `_listIsExhaustive` below pins the list to the type:
 * `Uncovered` is only ever `never` when every union member appears in
 * `ALL_REQUEST_STATUSES`, so adding a status to the union without adding it here breaks
 * typecheck on this file, not just on the map.
 *
 * `importRequested` is included even though a *book* request can never actually reach
 * it in practice (it's music's own terminal state out of `importing` — see
 * `apps/server/src/requests/requestStatus.ts`'s header comment) — `RequestStatus` is one
 * union shared by both request kinds, so this list, and the map it checks, must cover it
 * regardless of which kind is reachable.
 */
const ALL_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'searching',
  'downloading',
  'importing',
  'completed',
  'importRequested',
  'failed',
] as const;

type Uncovered = Exclude<RequestStatus, (typeof ALL_REQUEST_STATUSES)[number]>;
// A status missing from `ALL_REQUEST_STATUSES` makes `Uncovered` non-`never`, which makes
// this type `false` — and assigning `true` to a `const` typed `false` fails typecheck.
const _listIsExhaustive: Uncovered extends never ? true : false = true;

describe('REQUEST_STATUS_LABEL', () => {
  it.each(ALL_REQUEST_STATUSES)('has a non-empty label for %s', (status) => {
    expect(REQUEST_STATUS_LABEL[status]).toBeTruthy();
  });
});

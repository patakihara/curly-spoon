import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isTerminal,
  REQUEST_STATUSES,
  type RequestStatus,
} from './requestStatus.js';

describe('canTransition', () => {
  const legal: Array<[RequestStatus, RequestStatus]> = [
    ['pending', 'approved'],
    ['pending', 'rejected'],
    ['approved', 'searching'],
    ['approved', 'failed'],
    ['searching', 'downloading'],
    ['searching', 'failed'],
    ['downloading', 'importing'],
    ['downloading', 'failed'],
    ['importing', 'completed'],
    ['importing', 'failed'],
    ['failed', 'searching'],
  ];

  for (const [from, to] of legal) {
    it(`allows ${from} -> ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
    });
  }

  const illegal: Array<[RequestStatus, RequestStatus]> = [
    // Skipping the pipeline entirely.
    ['pending', 'downloading'],
    ['pending', 'searching'],
    ['pending', 'completed'],
    ['pending', 'failed'],
    // Every transition out of a terminal state.
    ['completed', 'pending'],
    ['completed', 'approved'],
    ['completed', 'searching'],
    ['completed', 'downloading'],
    ['completed', 'importing'],
    ['completed', 'failed'],
    ['completed', 'rejected'],
    ['rejected', 'pending'],
    ['rejected', 'approved'],
    ['rejected', 'searching'],
    ['rejected', 'downloading'],
    ['rejected', 'importing'],
    ['rejected', 'completed'],
    ['rejected', 'failed'],
    // Backward moves within the working pipeline.
    ['downloading', 'searching'],
    ['importing', 'downloading'],
    ['searching', 'approved'],
    // failed only reopens at searching, not deeper into the pipeline.
    ['failed', 'downloading'],
    ['failed', 'importing'],
    ['failed', 'completed'],
  ];

  for (const [from, to] of illegal) {
    it(`forbids ${from} -> ${to}`, () => {
      expect(canTransition(from, to)).toBe(false);
    });
  }

  for (const status of REQUEST_STATUSES) {
    it(`forbids ${status} -> ${status} (self-transition)`, () => {
      expect(canTransition(status, status)).toBe(false);
    });
  }
});

describe('isTerminal', () => {
  it('treats completed as terminal', () => {
    expect(isTerminal('completed')).toBe(true);
  });

  it('treats rejected as terminal', () => {
    expect(isTerminal('rejected')).toBe(true);
  });

  it('does not treat failed as terminal, because retry via searching is legal', () => {
    expect(isTerminal('failed')).toBe(false);
  });

  for (const status of ['pending', 'approved', 'searching', 'downloading', 'importing'] as const) {
    it(`does not treat ${status} as terminal`, () => {
      expect(isTerminal(status)).toBe(false);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.js';
import { describeSetupError } from './setupErrors.js';

function upstreamUnreachable(detail: string): ApiError {
  return new ApiError('upstream_unreachable', `Could not reach Audiobookshelf: ${detail}`, 502);
}

describe('describeSetupError', () => {
  it('distinguishes an unreachable host (DNS failure)', () => {
    const diag = describeSetupError(upstreamUnreachable('getaddrinfo ENOTFOUND nope.example'));
    expect(diag.heading).toMatch(/find|reach/i);
    expect(diag.detail).not.toBe('');
  });

  it('distinguishes a refused connection from a DNS failure', () => {
    const diag = describeSetupError(upstreamUnreachable('connect ECONNREFUSED 127.0.0.1:8080'));
    expect(diag.heading.toLowerCase()).toContain('refused');
  });

  it('distinguishes a TLS failure', () => {
    const diag = describeSetupError(upstreamUnreachable('unable to verify the first certificate'));
    expect(diag.heading.toLowerCase()).toMatch(/tls|certificate/);
  });

  it('distinguishes "wrong path" (a reachable server answering 404)', () => {
    const diag = describeSetupError(new ApiError('not_found', 'Not found upstream: /status', 404));
    expect(diag.heading.toLowerCase()).toContain('path');
  });

  it('distinguishes "reachable but not Audiobookshelf" (schema mismatch)', () => {
    const diag = describeSetupError(
      new ApiError('upstream_schema_mismatch', 'did not match the expected shape', 502),
    );
    expect(diag.heading.toLowerCase()).not.toContain("can't reach");
    expect(diag.detail.toLowerCase()).toContain('audiobookshelf');
  });

  it('distinguishes the Auralis server itself being unreachable from an upstream problem', () => {
    const diag = describeSetupError(
      new ApiError('network_error', 'Could not reach the Auralis server: fetch failed', 0),
    );
    expect(diag.heading.toLowerCase()).toContain('auralis');
  });

  it('never returns an empty or generic-only message for any known code', () => {
    const codes = [
      'upstream_unreachable',
      'upstream_timeout',
      'not_found',
      'upstream_schema_mismatch',
      'upstream_error',
      'upstream_rejected',
      'invalid_request',
      'something_new_the_server_added',
    ];
    for (const code of codes) {
      const diag = describeSetupError(new ApiError(code, 'some detail', 500));
      expect(diag.heading.length).toBeGreaterThan(0);
      expect(diag.detail.length).toBeGreaterThan(0);
    }
  });
});

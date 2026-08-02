import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorFromNetworkFailure, apiErrorFromResponse } from './errors.js';

describe('ApiError', () => {
  it('flags status 0 as a network-origin error', () => {
    const err = new ApiError('network_error', 'nope', 0);
    expect(err.isNetworkError).toBe(true);
  });

  it('does not flag a BFF-reported error as network-origin', () => {
    const err = new ApiError('not_configured', 'nope', 409);
    expect(err.isNetworkError).toBe(false);
  });
});

describe('apiErrorFromResponse', () => {
  it('parses the BFF { error: { code, message } } shape', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'unauthenticated', message: 'Sign in required' } }),
      { status: 401 },
    );
    const err = await apiErrorFromResponse(response);
    expect(err.code).toBe('unauthenticated');
    expect(err.message).toBe('Sign in required');
    expect(err.status).toBe(401);
  });

  it('degrades to a generic error for a non-JSON body (e.g. a proxy error page)', async () => {
    const response = new Response('<html>502 Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });
    const err = await apiErrorFromResponse(response);
    expect(err.code).toBe('unexpected_response');
    expect(err.status).toBe(502);
    expect(err.message).not.toBe('');
  });

  it('degrades to a generic error for JSON that is not the expected shape', async () => {
    const response = new Response(JSON.stringify({ oops: true }), { status: 500 });
    const err = await apiErrorFromResponse(response);
    expect(err.code).toBe('unexpected_response');
  });

  it('never throws, even on an empty body', async () => {
    const response = new Response('', { status: 500 });
    await expect(apiErrorFromResponse(response)).resolves.toBeInstanceOf(ApiError);
  });
});

describe('apiErrorFromNetworkFailure', () => {
  it('wraps the cause message and marks it as a network error', () => {
    const err = apiErrorFromNetworkFailure(new TypeError('Failed to fetch'));
    expect(err.isNetworkError).toBe(true);
    expect(err.message).toContain('Failed to fetch');
  });

  it('stringifies non-Error causes', () => {
    const err = apiErrorFromNetworkFailure('boom');
    expect(err.message).toContain('boom');
  });
});

import { describe, expect, it } from 'vitest';
import { JellyfinError, isJellyfinError } from './errors.js';

describe('JellyfinError', () => {
  it('carries a machine-checkable code distinct from the message', () => {
    const err = JellyfinError.auth(401);
    expect(err.code).toBe('auth');
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(Error);
  });

  it('builds a network error from an arbitrary cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = JellyfinError.network(cause);
    expect(err.code).toBe('network');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('ECONNREFUSED');
  });

  it('builds a timeout error mentioning the configured budget', () => {
    const err = JellyfinError.timeout(5000);
    expect(err.code).toBe('timeout');
    expect(err.message).toContain('5000');
  });

  it('builds a forbidden error distinct from auth, carrying a 403 status', () => {
    const err = JellyfinError.forbidden(403);
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.code).not.toBe('auth');
  });

  it('builds a not_found error carrying a 404 status', () => {
    const err = JellyfinError.notFound('/Items/xyz');
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
  });

  it('builds an upstream_error for 5xx', () => {
    const err = JellyfinError.upstream(503, 'maintenance');
    expect(err.code).toBe('upstream_error');
    expect(err.status).toBe(503);
    expect(err.message).toContain('503');
  });

  it('builds a bad_request for other 4xx', () => {
    const err = JellyfinError.badRequest(422, 'bad filter');
    expect(err.code).toBe('bad_request');
    expect(err.status).toBe(422);
  });

  it('builds a schema_mismatch carrying the parse failure as cause', () => {
    const cause = new Error('zod said no');
    const err = JellyfinError.schemaMismatch('GET /Items', cause);
    expect(err.code).toBe('schema_mismatch');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('/Items');
  });

  describe('isJellyfinError', () => {
    it('narrows JellyfinError instances', () => {
      expect(isJellyfinError(JellyfinError.auth(401))).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isJellyfinError(new Error('plain'))).toBe(false);
      expect(isJellyfinError('nope')).toBe(false);
      expect(isJellyfinError(undefined)).toBe(false);
    });
  });
});

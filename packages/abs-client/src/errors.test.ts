import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AbsError, isAbsError } from './errors.js';

describe('AbsError', () => {
  it('carries a machine-checkable code distinct from the message', () => {
    const err = AbsError.auth(401);
    expect(err.code).toBe('auth');
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(Error);
  });

  it('builds a network error from an arbitrary cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = AbsError.network(cause);
    expect(err.code).toBe('network');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('ECONNREFUSED');
  });

  it('builds a timeout error mentioning the configured budget', () => {
    const err = AbsError.timeout(5000);
    expect(err.code).toBe('timeout');
    expect(err.message).toContain('5000');
  });

  it('builds a forbidden error distinct from auth, carrying a 403 status', () => {
    const err = AbsError.forbidden(403);
    expect(err.code).toBe('forbidden');
    expect(err.status).toBe(403);
    expect(err.code).not.toBe('auth');
  });

  it('builds a not_found error carrying a 404 status', () => {
    const err = AbsError.notFound('/api/items/xyz');
    expect(err.code).toBe('not_found');
    expect(err.status).toBe(404);
  });

  it('builds an upstream_error for 5xx', () => {
    const err = AbsError.upstream(503, 'maintenance');
    expect(err.code).toBe('upstream_error');
    expect(err.status).toBe(503);
    expect(err.message).toContain('503');
  });

  it('builds a bad_request for other 4xx', () => {
    const err = AbsError.badRequest(422, 'bad filter');
    expect(err.code).toBe('bad_request');
    expect(err.status).toBe(422);
  });

  it('builds a schema_mismatch carrying the parse failure as cause', () => {
    const cause = new Error('zod said no');
    const err = AbsError.schemaMismatch('GET /api/libraries', cause);
    expect(err.code).toBe('schema_mismatch');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('/api/libraries');
  });

  it('names the field path and expected/received types for a ZodError cause', () => {
    const schema = z.object({ audioTracks: z.array(z.object({ metadata: z.object({}) })) });
    const result = schema.safeParse({ audioTracks: [{ metadata: null }] });
    if (result.success) throw new Error('expected parse failure');

    const err = AbsError.schemaMismatch('POST /api/items/x/play', result.error);
    expect(err.message).toContain('audioTracks.0.metadata');
    expect(err.message).toContain('expected object');
    expect(err.message).toContain('received null');
  });

  it('never includes the actual received value, only its type, so a token- or', () => {
    // URL-shaped field can't leak through a schema-mismatch message.
    const schema = z.object({ token: z.string() });
    const result = schema.safeParse({ token: 12345 });
    if (result.success) throw new Error('expected parse failure');

    const err = AbsError.schemaMismatch('POST /auth/login', result.error);
    expect(err.message).not.toContain('12345');
    expect(err.message).toContain('token');
    expect(err.message).toContain('expected string');
  });

  it('caps the number of issues listed so a badly-shaped payload stays readable', () => {
    const schema = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
      f: z.string(),
      g: z.string(),
    });
    const result = schema.safeParse({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 });
    if (result.success) throw new Error('expected parse failure');

    const err = AbsError.schemaMismatch('GET /api/x', result.error);
    expect(err.message).toContain('a (expected string');
    expect(err.message).toContain('e (expected string');
    expect(err.message).not.toContain('f (expected string');
    expect(err.message).toContain('and 2 more');
  });

  it('falls back to the plain message when the cause is not a ZodError', () => {
    const err = AbsError.schemaMismatch('GET /api/libraries', 'not a zod error');
    expect(err.message).toBe(
      'Audiobookshelf response for GET /api/libraries did not match the expected shape',
    );
  });

  describe('isAbsError', () => {
    it('narrows AbsError instances', () => {
      expect(isAbsError(AbsError.auth(401))).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isAbsError(new Error('plain'))).toBe(false);
      expect(isAbsError('nope')).toBe(false);
      expect(isAbsError(undefined)).toBe(false);
    });
  });
});

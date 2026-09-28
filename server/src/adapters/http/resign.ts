/**
 * Recordings of the sign-on keep its ID token real in shape: the header and the claim set stay,
 * but the claims are scrubbed and the token is re-signed with the committed test key under the
 * recorded `kid`, and the recorded signing keys' `n` and `e` become the test key's. So a replayed
 * sign-in verifies exactly as a live one does, and no real signature or key is committed.
 */
import { PLACEHOLDER_ORIGIN, type RawExchange, scrubString } from './scrub.js';
import { decodePart, JWT_SHAPE, signWithTestKey, TEST_PUBLIC_JWK } from './testSigningKey.js';

/** Where a scrubbed ID token says it came from: the same origin the rest of a recording gets. */
export const PLACEHOLDER_ISSUER = PLACEHOLDER_ORIGIN;

function scrubClaims(value: unknown, issuer: string): unknown {
  if (typeof value === 'string') return scrubString(value.split(issuer).join(PLACEHOLDER_ISSUER));
  if (Array.isArray(value)) return value.map((v) => scrubClaims(v, issuer));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubClaims(v, issuer)]));
  }
  return value;
}

/** The token with scrubbed claims, signed by the test key; the header is kept as recorded. */
export function resignJwt(token: string, issuer: string): string {
  const [header, payload] = token.split('.') as [string, string];
  return signWithTestKey(
    decodePart(header),
    scrubClaims(decodePart(payload), issuer.replace(/\/$/, '')),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Before the scrubber: every `id_token` in a response is re-signed, and every RSA key of a JWKS
 * answer gets the test key's modulus and exponent.
 */
export function resignExchange(raw: RawExchange, issuer: string): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body) || !isRecord(body.json)) return raw;
  const json = { ...body.json };
  if (typeof json.id_token === 'string' && JWT_SHAPE.test(json.id_token)) {
    json.id_token = resignJwt(json.id_token, issuer);
  }
  if (Array.isArray(json.keys)) {
    json.keys = json.keys.map((key: unknown) =>
      isRecord(key) && key.kty === 'RSA' ? { ...key, ...TEST_PUBLIC_JWK } : key,
    );
  }
  return { ...raw, response: { ...raw.response, body: { json } } };
}

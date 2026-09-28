/**
 * Recordings of the sign-on keep its ID token real in shape: the header and the claim set stay,
 * but the claims are scrubbed and the token is re-signed with the committed test key under the
 * recorded `kid`, and the recorded signing keys' `n` and `e` become the test key's, with their
 * certificate chain and thumbprints dropped. So a replayed sign-in verifies exactly as a live one
 * does, and no real signature or key is committed. A person's name and email claims, in the ID
 * token and in userinfo, become placeholders; only the test identity keeps its username.
 */
import {
  PLACEHOLDER_EMAIL,
  PLACEHOLDER_HOME_USER,
  PLACEHOLDER_ORIGIN,
  type RawExchange,
  scrubString,
} from './scrub.js';
import { decodePart, JWT_SHAPE, signWithTestKey, TEST_PUBLIC_JWK } from './testSigningKey.js';

/** Where a scrubbed ID token says it came from: the same origin the rest of a recording gets. */
export const PLACEHOLDER_ISSUER = PLACEHOLDER_ORIGIN;

/** Who a person is, in their own words: never committed but for the test identity's username. */
const NAME_CLAIMS = ['name', 'given_name', 'family_name', 'preferred_username'] as const;
/** Certificate material a JWKS key may carry, besides the modulus the test key replaces. */
const KEY_CERT_FIELDS = ['x5c', 'x5t', 'x5t#S256'] as const;

function scrubIdentity(claims: Record<string, unknown>, keep: readonly string[]) {
  const out = { ...claims };
  const kept = keep.map((k) => k.toLowerCase());
  for (const claim of NAME_CLAIMS) {
    const value = out[claim];
    if (typeof value !== 'string') continue;
    if (claim === 'preferred_username' && kept.includes(value.toLowerCase())) continue;
    out[claim] = PLACEHOLDER_HOME_USER;
  }
  if (typeof out.email === 'string') out.email = PLACEHOLDER_EMAIL;
  return out;
}

function scrubClaims(value: unknown, issuer: string): unknown {
  if (typeof value === 'string') return scrubString(value.split(issuer).join(PLACEHOLDER_ISSUER));
  if (Array.isArray(value)) return value.map((v) => scrubClaims(v, issuer));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubClaims(v, issuer)]));
  }
  return value;
}

/** The token with scrubbed claims, signed by the test key; the header is kept as recorded. */
export function resignJwt(token: string, issuer: string, keep: readonly string[] = []): string {
  const [header, payload] = token.split('.') as [string, string];
  const claims = decodePart(payload);
  return signWithTestKey(
    decodePart(header),
    scrubClaims(isRecord(claims) ? scrubIdentity(claims, keep) : claims, issuer.replace(/\/$/, '')),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function testKey(key: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...key, ...TEST_PUBLIC_JWK };
  for (const field of KEY_CERT_FIELDS) delete out[field];
  return out;
}

/**
 * Before the scrubber: every `id_token` in a response is re-signed, a userinfo answer (a body
 * with a `sub`) has its name and email claims replaced, and every RSA key of a JWKS answer gets
 * the test key's modulus and exponent. `keep` names the test identity's username.
 */
export function resignExchange(
  raw: RawExchange,
  issuer: string,
  keep: readonly string[] = [],
): RawExchange {
  const body = raw.response.body;
  if (body === null || !('json' in body) || !isRecord(body.json)) return raw;
  let json = { ...body.json };
  if (typeof json.sub === 'string') json = scrubIdentity(json, keep);
  if (typeof json.id_token === 'string' && JWT_SHAPE.test(json.id_token)) {
    json.id_token = resignJwt(json.id_token, issuer, keep);
  }
  if (Array.isArray(json.keys)) {
    json.keys = json.keys.map((key: unknown) =>
      isRecord(key) && key.kty === 'RSA' ? testKey(key) : key,
    );
  }
  return { ...raw, response: { ...raw.response, body: { json } } };
}

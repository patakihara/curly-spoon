/**
 * The committed RS256 test key. It re-signs the ID tokens in scrubbed recordings, so a JWT may sit
 * in a recording only when it verifies against this key; nothing outside tests trusts it.
 */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import testKey from './test-signing-key.json' with { type: 'json' };

const { label: _label, alg: _alg, ...privateJwk } = testKey;
const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
const publicKey = createPublicKey(privateKey);

/** The key's public half, as a JWKS entry carries it. */
export const TEST_PUBLIC_JWK = { kty: 'RSA', n: testKey.n, e: testKey.e } as const;

export const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;

export const decodePart = (part: string): unknown =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
const encodePart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** An RS256 JWT of this header and payload, signed by the test key. */
export function signWithTestKey(header: unknown, payload: unknown): string {
  const input = `${encodePart(header)}.${encodePart(payload)}`;
  return `${input}.${sign('sha256', Buffer.from(input), privateKey).toString('base64url')}`;
}

/** True when `value` is an RS256 JWT signed by the test key. */
export function isTestSignedJwt(value: string): boolean {
  if (!JWT_SHAPE.test(value)) return false;
  const [header, payload, signature] = value.split('.') as [string, string, string];
  try {
    if ((decodePart(header) as { alg?: unknown }).alg !== 'RS256') return false;
    return verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}

/** The claims of a JWT, for the scan to look inside. */
export function jwtClaims(value: string): unknown {
  return decodePart(value.split('.')[1] as string);
}

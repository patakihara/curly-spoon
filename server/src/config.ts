import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommitId } from '@auralis/schema';
import { z } from 'zod';
import { isProxyEntry } from './auth/proxy.js';

/** web's build sits next to server/ in both the repo and the image. */
const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATA_DIR: z.string().min(1).default('./data'),
  WEB_DIST_DIR: z.string().min(1).default(DEFAULT_WEB_DIST_DIR),
  // Forwarded headers are believed only from these: IPs, CIDRs or hostnames. Empty trusts none.
  TRUST_PROXY: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== ''),
    )
    .pipe(z.array(z.string().refine(isProxyEntry, 'not an IP, a CIDR or a hostname'))),
  // `auto` marks the cookie Secure whenever the request came in over HTTPS.
  COOKIE_SECURE: z
    .enum(['auto', 'true', 'false'])
    .default('auto')
    .transform((value) => (value === 'auto' ? value : value === 'true')),
  // The origin browsers load the app from; a signed-in write from any other is refused.
  PUBLIC_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) && url.pathname === '/' && !url.search && !url.hash;
    }, 'an http or https origin with no path')
    .transform((value) => new URL(value).origin)
    .optional(),
  // The household sign-on. With an issuer, the client secret file and PUBLIC_ORIGIN are required.
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).default('auralis'),
  OIDC_CLIENT_SECRET_FILE: z.string().min(1).optional(),
  // Each upstream, with the file its admin-level key is in.
  ABS_URL: z.string().url().optional(),
  ABS_PROVISION_KEY_FILE: z.string().min(1).optional(),
  JELLYFIN_URL: z.string().url().optional(),
  JELLYFIN_API_KEY_FILE: z.string().min(1).optional(),
  // The key that encrypts each person's upstream tokens: base64 here, or a 0600 file.
  SECRET_KEY: z.string().min(1).optional(),
  SECRET_KEY_FILE: z.string().min(1).optional(),
  // The commit the image was built from, set by its build; empty or unset outside an image.
  AURALIS_COMMIT: z
    .string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(CommitId.optional()),
});

export type CookieSecure = 'auto' | boolean;

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  webDistDir: string;
  trustProxy: string[];
  cookieSecure: CookieSecure;
  publicOrigin: string | undefined;
  oidc: OidcConfig | null;
  abs: UpstreamConfig | null;
  jellyfin: UpstreamConfig | null;
  secretKey: string | undefined;
  secretKeyFile: string;
  commit: string | null;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecretFile: string;
  redirectUri: string;
}

export interface UpstreamConfig {
  url: string;
  keyFile: string;
}

function required<T>(value: T | undefined, name: string, because: string): T {
  if (value === undefined) throw new Error(`${name} is required ${because}`);
  return value;
}

function upstream(
  url: string | undefined,
  keyFile: string | undefined,
  keyName: string,
  urlName: string,
) {
  if (url === undefined) return null;
  return { url, keyFile: required(keyFile, keyName, `with ${urlName}`) };
}

/** Fails fast at boot: a server started with a malformed environment should not start at all. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    dataDir: parsed.DATA_DIR,
    webDistDir: parsed.WEB_DIST_DIR,
    trustProxy: parsed.TRUST_PROXY,
    cookieSecure: parsed.COOKIE_SECURE,
    publicOrigin: parsed.PUBLIC_ORIGIN,
    oidc:
      parsed.OIDC_ISSUER === undefined
        ? null
        : {
            issuer: parsed.OIDC_ISSUER,
            clientId: parsed.OIDC_CLIENT_ID,
            clientSecretFile: required(
              parsed.OIDC_CLIENT_SECRET_FILE,
              'OIDC_CLIENT_SECRET_FILE',
              'with OIDC_ISSUER',
            ),
            redirectUri: `${required(parsed.PUBLIC_ORIGIN, 'PUBLIC_ORIGIN', 'with OIDC_ISSUER')}/api/auth/callback`,
          },
    abs: upstream(
      parsed.ABS_URL,
      parsed.ABS_PROVISION_KEY_FILE,
      'ABS_PROVISION_KEY_FILE',
      'ABS_URL',
    ),
    jellyfin: upstream(
      parsed.JELLYFIN_URL,
      parsed.JELLYFIN_API_KEY_FILE,
      'JELLYFIN_API_KEY_FILE',
      'JELLYFIN_URL',
    ),
    secretKey: parsed.SECRET_KEY,
    secretKeyFile: parsed.SECRET_KEY_FILE ?? join(parsed.DATA_DIR, 'secret.key'),
    commit: parsed.AURALIS_COMMIT ?? null,
  };
}

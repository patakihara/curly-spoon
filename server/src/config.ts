import { fileURLToPath } from 'node:url';
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
  };
}

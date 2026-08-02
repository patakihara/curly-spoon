/**
 * Environment-driven configuration, parsed once at boot.
 *
 * Failing fast with a readable message here is the whole point: a missing or
 * short `SESSION_SECRET` silently producing a weak encryption key is far worse
 * than refusing to start.
 */

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().max(65535).default(8787),
  DATA_DIR: z.string().min(1).default('./data'),
  // Also doubles as the AES-256-GCM key material for the secrets table (db/crypto.ts) —
  // 32 chars is a floor, not a recommendation; operators should use a generated random value.
  SESSION_SECRET: z
    .string()
    .min(
      32,
      'SESSION_SECRET must be at least 32 characters — it derives the encryption key for stored upstream credentials',
    ),
  AURALIS_FAKE_UPSTREAMS: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Serves apps/web/dist from this same process/port (see static.ts). Left on by
  // default: the effective gate is "does a build exist on disk", so `pnpm dev`
  // (which never runs `vite build`) needs no special-casing here — this flag is
  // the explicit escape hatch for the rarer case of wanting it off regardless.
  AURALIS_SERVE_WEB: z
    .enum(['0', '1'])
    .default('1')
    .transform((v) => v === '1'),
  // Override for where the built web app lives — defaults to ../../web/dist
  // relative to this package (see static.ts's DEFAULT_WEB_DIST_DIR). The
  // Docker image sets this explicitly rather than relying on relative layout.
  WEB_DIST_DIR: z.string().min(1).optional(),
});

export interface AppConfig {
  port: number;
  dataDir: string;
  sessionSecret: string;
  fakeUpstreams: boolean;
  nodeEnv: 'development' | 'production' | 'test';
  /** Whether the BFF should attempt to serve the built web app. Treat `undefined` as enabled — only tests explicitly set this to `false`. */
  serveWeb?: boolean;
  webDistDir?: string;
}

/** Raised when the environment fails validation; `.message` is safe to log or print as-is. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Parse `env` (defaults to `process.env`) into an `AppConfig`, or throw a `ConfigError`. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid environment configuration — ${issues}`);
  }

  return {
    port: parsed.data.PORT,
    dataDir: parsed.data.DATA_DIR,
    sessionSecret: parsed.data.SESSION_SECRET,
    fakeUpstreams: parsed.data.AURALIS_FAKE_UPSTREAMS,
    nodeEnv: parsed.data.NODE_ENV,
    serveWeb: parsed.data.AURALIS_SERVE_WEB,
    webDistDir: parsed.data.WEB_DIST_DIR,
  };
}

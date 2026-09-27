import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** web's build sits next to server/ in both the repo and the image. */
const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  HOST: z.string().min(1).default('0.0.0.0'),
  // Where the server keeps its state. Read now so the deployment contract is fixed; the store
  // that writes to it arrives with the first feature that needs one.
  DATA_DIR: z.string().min(1).optional(),
  WEB_DIST_DIR: z.string().min(1).default(DEFAULT_WEB_DIST_DIR),
});

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string | undefined;
  webDistDir: string;
}

/** Fails fast at boot: a server started with a malformed environment should not start at all. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    dataDir: parsed.DATA_DIR,
    webDistDir: parsed.WEB_DIST_DIR,
  };
}

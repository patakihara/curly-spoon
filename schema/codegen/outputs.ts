/** Every file `pnpm gen` writes, relative to the output root (the repo root by default). */
export const OUTPUTS = {
  openapi: 'schema/generated/openapi.json',
  typescript: 'web/src/generated/api/schema.ts',
  kotlin: 'android/app/src/main/java/net/develivarr/auralis/generated/api/ApiModels.kt',
} as const;

export const KOTLIN_PACKAGE = 'net.develivarr.auralis.generated.api';

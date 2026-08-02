/// <reference types="vite/client" />

/**
 * Ambient types for the web app's build environment.
 *
 * `import.meta.env` is typed by Vite's own declarations; anything Auralis adds to the
 * environment is declared here so a missing variable is a type error at build time rather
 * than `undefined` at runtime.
 */
interface ImportMetaEnv {
  /**
   * Base URL of the Auralis BFF. Empty in production, where the API is served from the
   * same origin as the app; set during development to point at the local server.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

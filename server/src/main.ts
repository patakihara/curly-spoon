import { loadConfig } from './config.js';
import { assembleServer } from './server.js';

const config = loadConfig();
const server = await assembleServer(config, {
  fetch: (url, init) => globalThis.fetch(url, init),
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}

await server.app.listen({ port: config.port, host: config.host });
